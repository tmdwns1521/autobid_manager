import { decideBid, BiddingContext } from '../bidding.engine'
import { BiddingState, BidDecision } from '@autobid/shared'

// 기본 컨텍스트: 목표 3위, 현재 5위, 입찰가 1,000원
const BASE: BiddingContext = {
  currentRank: 5,
  targetRank: 3,
  rankUpperBound: 2,  // 2위까지 허용 (과달성)
  rankLowerBound: 4,  // 4위까지 허용 (미달)
  currentBid: 1000,
  minBid: 100,
  maxBid: 5000,
  baseStep: 100,
  state: BiddingState.SEARCHING,
  stableCount: 0,
  stableBid: null,
  lastBidChangedAt: null,
  noRankChangeCount: 0,
  cooldownUntil: null,
  lastSuccessRank: null,
}

const ctx = (overrides: Partial<BiddingContext>): BiddingContext => ({ ...BASE, ...overrides })

// ─── 쿨다운 ─────────────────────────────────────────────────────────────────

describe('decideBid — 쿨다운', () => {
  it('cooldownUntil이 미래면 COOLDOWN을 반환한다', () => {
    const result = decideBid(ctx({ cooldownUntil: new Date(Date.now() + 60_000) }))
    expect(result.decision).toBe(BidDecision.COOLDOWN)
    expect(result.nextState).toBe(BiddingState.COOLDOWN)
    expect(result.newBid).toBe(1000)
  })

  it('cooldownUntil이 과거면 쿨다운이 아니다', () => {
    const result = decideBid(ctx({ cooldownUntil: new Date(Date.now() - 1000) }))
    expect(result.decision).not.toBe(BidDecision.COOLDOWN)
  })

  it('입찰 변경 후 2분이면 반영 대기 COOLDOWN', () => {
    const result = decideBid(ctx({ lastBidChangedAt: new Date(Date.now() - 2 * 60_000) }))
    expect(result.decision).toBe(BidDecision.COOLDOWN)
    expect(result.nextState).toBe(BiddingState.COOLDOWN)
  })

  it('입찰 변경 후 6분이면 쿨다운 해제', () => {
    const result = decideBid(ctx({ lastBidChangedAt: new Date(Date.now() - 6 * 60_000) }))
    expect(result.decision).not.toBe(BidDecision.COOLDOWN)
  })
})

// ─── 순위 조회 실패 ─────────────────────────────────────────────────────────

describe('decideBid — 순위 조회 실패', () => {
  it('currentRank가 null이면 RANK_CHECK_FAILED', () => {
    const result = decideBid(ctx({ currentRank: null }))
    expect(result.decision).toBe(BidDecision.RANK_CHECK_FAILED)
    expect(result.nextState).toBe(BiddingState.RANK_CHECK_FAILED)
    expect(result.newBid).toBe(1000) // 입찰가 유지
  })
})

// ─── 증액 (rankGap > 0) ──────────────────────────────────────────────────────

describe('decideBid — INCREASE', () => {
  it('rankGap=1(가까움) → 정밀 NEAR_STEP 400 (1,000 → 1,400)', () => {
    const result = decideBid(ctx({ currentRank: 4, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.INCREASE)
    expect(result.newBid).toBe(1400)
    expect(result.nextState).toBe(BiddingState.SEARCHING)
  })

  it('rankGap=2(가까움) → 정밀 NEAR_STEP 400 (1,000 → 1,400)', () => {
    const result = decideBid(ctx({ currentRank: 5, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.INCREASE)
    expect(result.newBid).toBe(1400)
  })

  it('rankGap=4(중간) → MID_STEP 700 (1,000 → 1,700)', () => {
    const result = decideBid(ctx({ currentRank: 7, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.INCREASE)
    expect(result.newBid).toBe(1700)
  })

  it('rankGap=7(멀다) → COARSE_STEP 1,500 (1,000 → 2,500)', () => {
    const result = decideBid(ctx({ currentRank: 10, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.INCREASE)
    expect(result.newBid).toBe(2500)
  })

  it('rankGap=5(멀다) → COARSE_STEP 1,500 적용 (1,000 → 2,500)', () => {
    const result = decideBid(ctx({ currentRank: 8, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.INCREASE)
    expect(result.newBid).toBe(2500)
  })

  it('INCREASE 후 stableCount는 0으로 리셋', () => {
    const result = decideBid(ctx({ currentRank: 5, targetRank: 3, stableCount: 2 }))
    expect(result.decision).toBe(BidDecision.INCREASE)
    expect(result.stableCount).toBe(0)
  })
})

// ─── 최대 입찰가 도달 ────────────────────────────────────────────────────────

describe('decideBid — MAX_BID_REACHED', () => {
  it('증액 결과가 maxBid 이상이면 MAX_BID_REACHED', () => {
    // gap=2(가까움) → +400 → 4,950 + 400 = 5,350 → min(5,350, 5,000) = 5,000 >= maxBid
    const result = decideBid(ctx({ currentBid: 4950, maxBid: 5000, currentRank: 5, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.MAX_BID_REACHED)
    expect(result.newBid).toBe(5000)
    expect(result.nextState).toBe(BiddingState.MAX_BID_REACHED)
  })

  it('정확히 maxBid와 같아도 MAX_BID_REACHED', () => {
    // 4,900 + 100×1 = 5,000 = maxBid
    const result = decideBid(ctx({ currentBid: 4900, maxBid: 5000, currentRank: 4, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.MAX_BID_REACHED)
  })
})

// ─── 목표 순위권 (HOLD / DECREASE_TEST) ─────────────────────────────────────

describe('decideBid — 목표 순위권', () => {
  // rankUpperBound=2, rankLowerBound=4 → 2~4위가 목표권

  it('목표권 첫 진입(rank=3) → HOLD, stableCount+1', () => {
    const result = decideBid(ctx({ currentRank: 3, stableCount: 0 }))
    expect(result.decision).toBe(BidDecision.HOLD)
    expect(result.stableCount).toBe(1)
    expect(result.nextState).toBe(BiddingState.TARGET_REACHED)
  })

  it('rankUpperBound 경계(rank=2)도 목표권 — rankGap=-1이지만 상한 내', () => {
    // rank=2 < targetRank=3 → rankGap=-1, inTargetZone = 2>=2 && 2<=4 = true → HOLD
    const result = decideBid(ctx({ currentRank: 2, stableCount: 0 }))
    expect(result.decision).toBe(BidDecision.HOLD)
  })

  it('stableCount 3 도달 → DECREASE_TEST, testBid = currentBid - step', () => {
    // stableCount=2, newStableCount=3 >= STABLE_COUNT_THRESHOLD(3)
    // testBid = 1,000 - max(10, floor(100×0.5)) = 1,000 - 50 = 950
    const result = decideBid(ctx({ currentRank: 3, stableCount: 2 }))
    expect(result.decision).toBe(BidDecision.DECREASE_TEST)
    expect(result.newBid).toBe(950)
    expect(result.stableBid).toBe(1000)
    expect(result.nextState).toBe(BiddingState.MIN_CPC_TESTING)
  })

  it('DECREASE_TEST에서 testBid < minBid → MIN_BID_REACHED', () => {
    // currentBid=120, step=50, testBid=70 < minBid=100
    const result = decideBid(ctx({ currentRank: 3, stableCount: 2, currentBid: 120, minBid: 100 }))
    expect(result.decision).toBe(BidDecision.MIN_BID_REACHED)
    expect(result.newBid).toBe(100)
  })
})

// ─── 감액 (rankGap < 0, 순위 과달성) ────────────────────────────────────────

describe('decideBid — DECREASE (순위 과달성)', () => {
  it('rank=1(gap=-2) → ×0.5 step 감액 (1,000 → 950)', () => {
    // gap abs=2 < 3 → step = max(10, floor(100×0.5)) = 50
    const result = decideBid(ctx({ currentRank: 1, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.DECREASE)
    expect(result.newBid).toBe(950)
    expect(result.nextState).toBe(BiddingState.SEARCHING)
  })

  it('gap abs >= 3 → baseStep 전체 감액 (1,000 → 900)', () => {
    // rank=1, target=5, gap=-4, abs=4 >= 3 → step=100
    const result = decideBid(ctx({ currentRank: 1, targetRank: 5 }))
    expect(result.decision).toBe(BidDecision.DECREASE)
    expect(result.newBid).toBe(900)
  })

  it('감액 결과가 minBid 이하 → MIN_BID_REACHED', () => {
    // currentBid=140, minBid=100, step=50 → max(140-50, 100) = 100 ≤ minBid
    const result = decideBid(ctx({ currentRank: 1, targetRank: 3, currentBid: 140, minBid: 100 }))
    expect(result.decision).toBe(BidDecision.MIN_BID_REACHED)
    expect(result.newBid).toBe(100)
  })
})

// ─── 경계 케이스 ─────────────────────────────────────────────────────────────

describe('decideBid — 경계 케이스', () => {
  it('목표순위와 현재순위가 동일하면 HOLD', () => {
    // rankGap = 3-3 = 0, inTargetZone = 3>=2 && 3<=4 = true
    const result = decideBid(ctx({ currentRank: 3, targetRank: 3 }))
    expect(result.decision).toBe(BidDecision.HOLD)
  })

  it('cooldownUntil과 rankGap > 0이 동시에 있으면 쿨다운 우선', () => {
    const result = decideBid(ctx({
      cooldownUntil: new Date(Date.now() + 60_000),
      currentRank: 10, // rank very low, would increase
    }))
    expect(result.decision).toBe(BidDecision.COOLDOWN)
  })
})
