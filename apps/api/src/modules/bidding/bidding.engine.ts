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
  estimatedBid?: number | null  // 네이버 estimate API 결과 (processor에서 주입)
  searchLow?: number | null     // 이진 탐색 하한 (너무 낮아서 순위 이탈한 값)
  searchHigh?: number | null    // 이진 탐색 상한 (순위 달성이 확인된 값)
}

export interface BiddingDecision {
  decision: BidDecision
  newBid: number
  reason: string
  nextState: BiddingState
  stableCount?: number
  stableBid?: number | null
  noRankChangeCount?: number
  searchLow?: number | null
  searchHigh?: number | null
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

  // 3. 현재 입찰가가 maxBid 초과 → 즉시 강제 감액
  if (ctx.currentBid > ctx.maxBid) {
    return {
      decision: BidDecision.DECREASE,
      newBid: ctx.maxBid,
      reason: `현재 입찰가(${ctx.currentBid.toLocaleString()}원)가 최대입찰가(${ctx.maxBid.toLocaleString()}원) 초과 → 강제 조정`,
      nextState: BiddingState.SEARCHING,
      stableCount: 0,
    }
  }

  // 4. 순위조회 실패
  if (ctx.currentRank === null) {
    return {
      decision: BidDecision.RANK_CHECK_FAILED,
      newBid: ctx.currentBid,
      reason: '순위 미확인 - 입찰 보류',
      nextState: BiddingState.RANK_CHECK_FAILED,
    }
  }

  const rankGap = ctx.currentRank - ctx.targetRank

  // 5. 이진 탐색 진행 중 (MIN_CPC_TESTING 상태) — rankGap 처리보다 반드시 먼저
  //    탐색 중 순위 이탈 시 INCREASE가 아닌 RESTORE로 처리해야 하므로
  if (ctx.state === BiddingState.MIN_CPC_TESTING) {
    const inTargetZone = ctx.currentRank >= ctx.rankUpperBound && ctx.currentRank <= ctx.rankLowerBound

    if (inTargetZone) {
      // 현재 testBid가 작동 → searchHigh를 현재가로 낮추고 다음 중간값 시도
      const searchHigh = ctx.currentBid
      const searchLow = ctx.searchLow ?? ctx.minBid

      if (searchHigh - searchLow <= BIDDING_DEFAULTS.BINARY_SEARCH_CONVERGENCE) {
        return {
          decision: BidDecision.HOLD,
          newBid: searchHigh,
          reason: `이진 탐색 수렴 완료 — 최적가 ${searchHigh.toLocaleString()}원 (탐색 범위 ${searchLow.toLocaleString()}~${searchHigh.toLocaleString()}원)`,
          nextState: BiddingState.TARGET_REACHED,
          stableCount: 0,
          stableBid: searchHigh,
          searchLow,
          searchHigh,
        }
      }

      const testBid = Math.round((searchHigh + searchLow) / 2 / 10) * 10
      return {
        decision: BidDecision.DECREASE_TEST,
        newBid: testBid,
        reason: `이진 탐색 감액 [${searchLow.toLocaleString()}~${searchHigh.toLocaleString()}] → ${testBid.toLocaleString()}원 테스트`,
        nextState: BiddingState.MIN_CPC_TESTING,
        stableBid: searchHigh,
        searchLow,
        searchHigh,
      }
    }

    // 순위 이탈 → searchLow를 현재가로 올리고 stableBid(searchHigh)로 복구
    const searchLow = ctx.currentBid
    const searchHigh = ctx.stableBid ?? ctx.searchHigh ?? ctx.currentBid

    if (searchHigh - searchLow <= BIDDING_DEFAULTS.BINARY_SEARCH_CONVERGENCE || !ctx.stableBid) {
      return {
        decision: BidDecision.RESTORE_STABLE_BID,
        newBid: searchHigh,
        reason: `이진 탐색 수렴 완료 — 최적가 ${searchHigh.toLocaleString()}원`,
        nextState: BiddingState.TARGET_REACHED,
        stableCount: 0,
        stableBid: searchHigh,
        searchLow,
        searchHigh,
      }
    }

    return {
      decision: BidDecision.RESTORE_STABLE_BID,
      newBid: searchHigh,
      reason: `이진 탐색: ${ctx.currentBid.toLocaleString()}원 너무 낮음 → ${searchHigh.toLocaleString()}원 복구, 탐색 범위 ${searchLow.toLocaleString()}~${searchHigh.toLocaleString()}원`,
      nextState: BiddingState.MIN_CPC_TESTING,
      stableCount: 0,
      stableBid: searchHigh,
      searchLow,
      searchHigh,
    }
  }

  // 6. 목표보다 순위가 낮음 (예: 목표 3위인데 현재 7위 → gap=4 → 증액)
  //    estimate API가 있으면 직접 점프, 없으면 성긴→정밀 스텝 폴백
  if (rankGap > 0) {
    // estimate API 결과가 현재가보다 높으면 해당 값으로 즉시 점프
    if (ctx.estimatedBid != null && ctx.estimatedBid > ctx.currentBid) {
      const jumpTarget = Math.min(Math.ceil(ctx.estimatedBid / 10) * 10, ctx.maxBid)

      if (jumpTarget >= ctx.maxBid) {
        return {
          decision: BidDecision.MAX_BID_REACHED,
          newBid: ctx.maxBid,
          reason: `예상 입찰가(${ctx.estimatedBid.toLocaleString()}원)가 maxBid 이상 → 최대입찰가 설정`,
          nextState: BiddingState.MAX_BID_REACHED,
          stableCount: 0,
        }
      }

      return {
        decision: BidDecision.INCREASE,
        newBid: jumpTarget,
        reason: `네이버 예상 입찰가 점프 (목표 ${rankGap}칸 낮음 → ${jumpTarget.toLocaleString()}원)`,
        nextState: BiddingState.SEARCHING,
        stableCount: 0,
        noRankChangeCount: 0,
      }
    }

    // 폴백: 성긴→정밀 스텝 (estimate 미사용 또는 실패 시)
    const step = getIncreaseStep(rankGap, ctx.baseStep)
    const newBid = Math.min(ctx.currentBid + step, ctx.maxBid)

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
      reason: `목표보다 ${rankGap}칸 낮음 → +${step.toLocaleString()}원 증액`,
      nextState: BiddingState.SEARCHING,
      stableCount: 0,
      noRankChangeCount: 0,
    }
  }

  // 7. 목표 순위권 내 (rankUpperBound ~ rankLowerBound) — SEARCHING/TARGET_REACHED 상태
  const inTargetZone = ctx.currentRank >= ctx.rankUpperBound && ctx.currentRank <= ctx.rankLowerBound

  if (inTargetZone) {
    const newStableCount = (ctx.stableCount ?? 0) + 1

    // 3회 연속 목표권 유지 → 이진 탐색 시작
    if (newStableCount >= BIDDING_DEFAULTS.STABLE_COUNT_THRESHOLD) {
      const searchHigh = ctx.currentBid
      const searchLow = ctx.minBid
      const testBid = Math.round((searchHigh + searchLow) / 2 / 10) * 10

      if (testBid <= searchLow) {
        return {
          decision: BidDecision.MIN_BID_REACHED,
          newBid: ctx.minBid,
          reason: '최소입찰가 근접 — 이진 탐색 불필요',
          nextState: BiddingState.MIN_CPC_TESTING,
          stableCount: newStableCount,
          stableBid: ctx.currentBid,
          searchLow,
          searchHigh,
        }
      }

      return {
        decision: BidDecision.DECREASE_TEST,
        newBid: testBid,
        reason: `${newStableCount}회 목표권 유지 → 이진 탐색 시작 [${searchLow.toLocaleString()}~${searchHigh.toLocaleString()}] → ${testBid.toLocaleString()}원 테스트`,
        nextState: BiddingState.MIN_CPC_TESTING,
        stableCount: newStableCount,
        stableBid: searchHigh,
        searchLow,
        searchHigh,
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

  // 8. 목표보다 순위가 높음 (예: 목표 3위인데 현재 1위 → gap=-2 → 감액)
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

// 목표에서 멀면 성긴 스텝(빠르게 접근), 가까우면 정밀 스텝으로 조율
// 목표 근처(1~2칸)도 경쟁 대응을 위해 최소 NEAR_STEP은 올린다 (baseStep이 더 크면 그 값 사용)
function getIncreaseStep(rankGap: number, baseStep: number): number {
  if (rankGap >= BIDDING_DEFAULTS.COARSE_GAP_THRESHOLD) return BIDDING_DEFAULTS.COARSE_STEP // 멀다 → +1,000
  if (rankGap >= BIDDING_DEFAULTS.MID_GAP_THRESHOLD) return BIDDING_DEFAULTS.MID_STEP       // 중간 → +500
  return Math.max(baseStep, BIDDING_DEFAULTS.NEAR_STEP) // 1~2칸: 최소 +300 (경쟁 대응)
}

function getDecreaseStep(rankGapAbs: number, baseStep: number): number {
  if (rankGapAbs >= 3) return baseStep
  return Math.max(BIDDING_DEFAULTS.MIN_DECREASE_UNIT, Math.floor(baseStep * 0.5))
}
