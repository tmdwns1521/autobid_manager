# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Automated bid manager for **Naver Search Ads (네이버 검색광고)**. It periodically checks a keyword's search rank and adjusts its bid up/down to converge on a user-defined target rank range at the lowest possible cost, then holds there.

## Monorepo layout

pnpm + Turborepo workspace with three packages:

- `apps/api` — NestJS backend (the bidding engine, schedulers, Naver API client, REST API)
- `apps/web` — Next.js 14 App Router dashboard (SWR + zustand + Tailwind + recharts)
- `packages/shared` — shared TS enums, interfaces, and constants, consumed as `@autobid/shared`. **Exported as raw `.ts` source** (no build step; `main`/`types` point at `src/index.ts`). Both apps map `@autobid/shared` to this source directly.

## Commands

Run from repo root (Turbo fans out to workspaces):

```bash
pnpm dev              # run all apps in watch mode
pnpm build            # build all
pnpm lint             # lint all
pnpm db:generate      # prisma generate (api)
pnpm db:migrate       # prisma migrate dev (api)
```

Infra (Postgres + Redis) via Docker:

```bash
docker-compose up -d  # postgres:5432 (db "autobid"), redis:6379
```

API-specific (run inside `apps/api`):

```bash
pnpm dev              # nest start --watch
pnpm start            # node dist/main (needs prior `pnpm build`)
pnpm test             # jest --silent
```

### Running tests — Windows gotcha

Jest's parallel workers crash on this Windows setup (`Jest worker encountered N child process exceptions`). Always run in-band:

```bash
npx jest --runInBand --no-coverage                    # all tests
npx jest naver-api.client --runInBand --no-coverage   # single file by name pattern
```

Tests live in `__tests__/*.spec.ts` next to the code they cover. `@autobid/shared` is resolved to source via `moduleNameMapper` in `apps/api/jest.config.js`.

## Environment variables (apps/api)

- `DATABASE_URL` — Postgres connection (compose default: `postgresql://postgres:password@localhost:5432/autobid`)
- `REDIS_HOST` / `REDIS_PORT` — Bull queue backend (default `localhost:6379`)
- `ENCRYPT_SECRET` — passphrase for AES-encrypting Naver API credentials at rest (crypto-js AES)
- `PORT` — API port. **Note the port mismatch**: API defaults to `3000`, but the web client (`apps/web/src/lib/api.ts`) expects the API at `http://localhost:4000/api`, and `web` dev also runs on `3000`. Set `PORT=4000` for the API in local dev (override with `NEXT_PUBLIC_API_URL` on the web side if needed). The API mounts all routes under the global `/api` prefix.

## Architecture: the bidding control loop

This is the core of the system and spans several files. Understand this before touching bidding.

**1. Sync (hourly cron)** — `ad-accounts/sync-scheduler.service.ts` pulls campaigns/adgroups/keywords from Naver into Postgres for every active account.

**2. Schedule (every 5 min cron)** — `bidding/bid-scheduler.ts` finds active `BiddingRule`s (skipping any in cooldown), and enqueues one `BidJobPayload` per rule onto the Bull `bid-job` queue. Uses a deterministic `jobId` (`bid-rule-<id>`) and skips a rule if its job is already active — this is the concurrency guard.

**3. Process (queue worker)** — `bidding/bid-job.processor.ts` handles each job:
   - Decrypts the account's Naver credentials with `ENCRYPT_SECRET`
   - Checks current rank (`rank-checker.service.ts`)
   - Loads/creates the rule's `BiddingState`
   - Calls the pure decision function `decideBid(ctx)` (`bidding/bidding.engine.ts`)
   - If the decision requires a bid change, calls `NaverApiClient.updateKeywordBid`, then persists the new bid on `Keyword`
   - Writes a `BidChange` audit row and updates `BiddingState`

**4. Decision engine** — `bidding/bidding.engine.ts` exports `decideBid(ctx): BiddingDecision`. It is a **pure function** (no I/O) implementing the state machine — this is where all bidding strategy lives and where unit tests concentrate. Summary of its logic:
   - Respects cooldown and a post-change "reflection wait" (`CHECK_INTERVAL_MINUTES`) before acting again
   - Rank below target → **increase** bid, accelerating by gap size (×1/×2/×3/×5)
   - Rank inside target zone (`rankUpperBound`..`rankLowerBound`) → **hold**; after `STABLE_COUNT_THRESHOLD` stable checks, begins **decrease-testing** (`MIN_CPC_TESTING`) to find the cheapest bid that keeps the rank, remembering the last known-good bid (`stableBid`)
   - Drifts out of zone while decrease-testing → **restore** `stableBid`
   - Rank above target (overpaying) → **decrease**
   - Clamped by the rule's `minBid`/`maxBid`

State is tracked per rule in `BiddingState` (`state`, `stableBid`, `stableCount`, `cooldownUntil`, `lastBidChangedAt`, etc.). The `BiddingState` / `BidDecision` enums and tuning constants (`BIDDING_DEFAULTS`) live in `@autobid/shared`.

### Rank measurement — important caveat

`rank-checker.service.ts` has two modes, chosen by whether a `siteUrl` is present:
- **`siteUrl` set → live scraping** (`naver-search-scraper.service.ts`, cheerio) — real-time actual SERP rank.
- **no `siteUrl` → Naver Stats API `avgRnk`** — this is **yesterday's daily-average rank**, a lagging metric. Bid changes made today won't show up until tomorrow's stats, so the loop cannot converge responsively in this mode. Prefer `siteUrl`-based scraping for real-time bidding.

## Naver Search Ad API client (`apps/api/src/naver/naver-api.client.ts`)

- Base URL: `https://api.searchad.naver.com`.
- **Auth signing**: every request sets `X-Timestamp`, `X-API-KEY` (access license), `X-Customer` (customer id), `X-Signature`. The signature is `HMAC-SHA256(secretKey, "{timestamp}.{METHOD}.{path}")` base64-encoded, where `path` **excludes the query string**.
- **Retry**: `callWithRetry` retries 5xx and 429 with backoff (`API_RETRY_DELAYS_MS`); all other 4xx fail immediately (no point retrying a bad request).
- **Updating a keyword bid** (`updateKeywordBid`): the correct Naver field name is **`useGroupBidAmt`** (not `useGroupBidding`). To set an individual bid you must send `fields=bidAmt,useGroupBidAmt` in the query AND include both `useGroupBidAmt: false` and `bidAmt` plus the required `nccAdgroupId` in the body — omitting any of these yields a 400 (`code 3916` "no bid amount" / `code 3705` "invalid ad group"). Naver returns rich error bodies in `err.response.data`; capture that (not just `err.message`) when logging failures.

## Data model (Prisma / Postgres)

Schema at `apps/api/prisma/schema.prisma`. Hierarchy: `Workspace → AdAccount → Campaign → AdGroup → Keyword`. Naver credentials are stored **encrypted** on `AdAccount` (`accessLicenseEncrypted`, `secretKeyEncrypted`). A `Keyword` has `BiddingRule`s; each rule has one `BiddingState` and produces `RankCheck` + `BidChange` history rows. Naver-side ids are stored as `naver*Id` fields and are the join keys back to the Naver API.

## Queues

Bull queues declared in `app.module.ts`: `bid-job`, `rank-check`, `naver-api`, `log` (names in `QUEUE_NAMES` from `@autobid/shared`). Only `bid-job` is actively processed today. All require Redis to be running, or the schedulers silently pile up failures.
