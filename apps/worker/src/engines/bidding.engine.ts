import { BidDecision, BiddingState, BIDDING_DEFAULTS } from '@autobid/shared'

export interface BiddingContext {
  currentRank: number | null
  targetRank: number
  rankUpperBound: number
  rankLowerBound: number
  currentBid: number
  minBid: number
  maxBid: number
  baseStep: number
  state: BiddingState
  stableCount: number
  stableBid: number | null
  lastBidChangedAt: Date | null
  noRankChangeCount: number
  cooldownUntil: Date | null
  lastSuccessRank: number | null
}

export interface BiddingDecision {
  decision: BidDecision
  newBid: number
  reason: string
  nextState: BiddingState
  stableCount?: number
  stableBid?: number | null
  noRankChangeCount?: number
}

export function decideBid(ctx: BiddingContext): BiddingDecision {
  const now = new Date()

  // 1. 쿨다운 체크
  if (ctx.cooldownUntil && ctx.cooldownUntil > now) {
    return {
      decision: BidDecision.COOLDOWN,
      newBid: ctx.currentBid,
      reason: `쿨다운 중 (${ctx.cooldownUntil.toISOString()} 까지)`,
      nextState: BiddingState.COOLDOWN,
    }
  }

  // 2. 입찰 반영 대기 체크 (입찰 변경 후 5분 대기, 2회 확인)
  if (ctx.lastBidChangedAt) {
    const minutesPassed = (now.getTime() - ctx.lastBidChangedAt.getTime()) / 60_000
    if (minutesPassed < BIDDING_DEFAULTS.CHECK_INTERVAL_MINUTES) {
      return {
        decision: BidDecision.COOLDOWN,
        newBid: ctx.currentBid,
        reason: `입찰 반영 대기 중 (변경 후 ${minutesPassed.toFixed(1)}분 경과)`,
        nextState: BiddingState.COOLDOWN,
      }
    }
  }

  // 3. 순위조회 실패
  if (ctx.currentRank === null) {
    return {
      decision: BidDecision.RANK_CHECK_FAILED,
      newBid: ctx.currentBid,
      reason: '순위 미확인 - 입찰 보류',
      nextState: BiddingState.RANK_CHECK_FAILED,
    }
  }

  const rankGap = ctx.currentRank - ctx.targetRank

  // 4. 목표보다 순위가 낮음 (예: 목표 3위인데 현재 7위 → gap=4 → 증액)
  if (rankGap > 0) {
    const multiplier = getIncreaseMultiplier(rankGap)
    const newBid = Math.min(ctx.currentBid + ctx.baseStep * multiplier, ctx.maxBid)

    if (newBid >= ctx.maxBid) {
      return {
        decision: BidDecision.MAX_BID_REACHED,
        newBid: ctx.maxBid,
        reason: `최대입찰가 도달 (목표보다 ${rankGap}칸 낮음)`,
        nextState: BiddingState.MAX_BID_REACHED,
        stableCount: 0,
      }
    }

    return {
      decision: BidDecision.INCREASE,
      newBid,
      reason: `목표보다 ${rankGap}칸 낮음 → ${multiplier}배 증액`,
      nextState: BiddingState.SEARCHING,
      stableCount: 0,
      noRankChangeCount: 0,
    }
  }

  // 5. 목표 순위권 내 (rankUpperBound ~ rankLowerBound)
  const inTargetZone = ctx.currentRank >= ctx.rankUpperBound && ctx.currentRank <= ctx.rankLowerBound

  if (inTargetZone) {
    const newStableCount = (ctx.stableCount ?? 0) + 1

    // 3회 연속 목표권 유지 → 최저가 탐색 시작
    if (newStableCount >= BIDDING_DEFAULTS.STABLE_COUNT_THRESHOLD) {
      const testBid = ctx.currentBid - Math.max(BIDDING_DEFAULTS.MIN_DECREASE_UNIT, Math.floor(ctx.baseStep * 0.5))

      if (testBid < ctx.minBid) {
        return {
          decision: BidDecision.MIN_BID_REACHED,
          newBid: ctx.minBid,
          reason: '최저가 탐색 중 최소입찰가 도달',
          nextState: BiddingState.MIN_CPC_TESTING,
          stableCount: newStableCount,
          stableBid: ctx.currentBid,
        }
      }

      return {
        decision: BidDecision.DECREASE_TEST,
        newBid: testBid,
        reason: `${newStableCount}회 목표권 유지 → 최저가 감액 테스트`,
        nextState: BiddingState.MIN_CPC_TESTING,
        stableCount: newStableCount,
        stableBid: ctx.currentBid,
      }
    }

    return {
      decision: BidDecision.HOLD,
      newBid: ctx.currentBid,
      reason: `목표순위 달성 (${newStableCount}/${BIDDING_DEFAULTS.STABLE_COUNT_THRESHOLD}회 안정화 중)`,
      nextState: BiddingState.TARGET_REACHED,
      stableCount: newStableCount,
    }
  }

  // 6. 최저가 탐색 중 이탈 → stable_bid로 복구
  if (ctx.state === BiddingState.MIN_CPC_TESTING && rankGap > 0 && ctx.stableBid) {
    return {
      decision: BidDecision.RESTORE_STABLE_BID,
      newBid: ctx.stableBid,
      reason: `최저가 테스트 중 순위 이탈 → 안정 입찰가 복구 (${ctx.stableBid}원)`,
      nextState: BiddingState.TARGET_REACHED,
      stableCount: 0,
    }
  }

  // 7. 목표보다 순위가 높음 (예: 목표 3위인데 현재 1위 → gap=-2 → 감액)
  if (rankGap < 0) {
    const step = getDecreaseStep(Math.abs(rankGap), ctx.baseStep)
    const newBid = Math.max(ctx.currentBid - step, ctx.minBid)

    if (newBid <= ctx.minBid) {
      return {
        decision: BidDecision.MIN_BID_REACHED,
        newBid: ctx.minBid,
        reason: `최소입찰가 도달 (목표보다 ${Math.abs(rankGap)}칸 높음)`,
        nextState: BiddingState.SEARCHING,
      }
    }

    return {
      decision: BidDecision.DECREASE,
      newBid,
      reason: `목표보다 ${Math.abs(rankGap)}칸 높음 → 과입찰 방지 감액`,
      nextState: BiddingState.SEARCHING,
      stableCount: 0,
    }
  }

  return {
    decision: BidDecision.HOLD,
    newBid: ctx.currentBid,
    reason: '목표순위 도달',
    nextState: BiddingState.TARGET_REACHED,
  }
}

function getIncreaseMultiplier(rankGap: number): number {
  if (rankGap >= 7) return 5
  if (rankGap >= 4) return 3
  if (rankGap >= 2) return 2
  return 1
}

function getDecreaseStep(rankGapAbs: number, baseStep: number): number {
  if (rankGapAbs >= 3) return baseStep
  return Math.max(BIDDING_DEFAULTS.MIN_DECREASE_UNIT, Math.floor(baseStep * 0.5))
}
