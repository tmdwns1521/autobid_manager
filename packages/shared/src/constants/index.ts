export const BIDDING_DEFAULTS = {
  CHECK_INTERVAL_MINUTES: 5,
  COOLDOWN_MINUTES: 5,
  BASE_STEP: 100,
  MIN_DECREASE_UNIT: 10,
  MAX_INCREASE_MULTIPLIER: 5,
  STABLE_COUNT_THRESHOLD: 3,
  MAX_CHANGES_PER_HOUR: 6,
  MAX_CHANGES_PER_DAY: 50,
  RANK_CHECK_RETRY_LIMIT: 2,
} as const

export const INCREASE_MULTIPLIER: Record<string, number> = {
  '7+': 5,
  '4-6': 3,
  '2-3': 2,
  '1': 1,
}

export const QUEUE_NAMES = {
  BID_JOB: 'bid-job',
  RANK_CHECK: 'rank-check',
  NAVER_API: 'naver-api',
  LOG: 'log',
} as const

export const REDIS_LOCK_TTL_SECONDS = 180
export const API_RETRY_DELAYS_MS = [30_000, 120_000] // 30s, 2min
