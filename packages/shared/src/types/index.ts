// ─── Enums ───────────────────────────────────────────────────────────────────

export enum BiddingState {
  SEARCHING = 'SEARCHING',
  TARGET_REACHED = 'TARGET_REACHED',
  MIN_CPC_TESTING = 'MIN_CPC_TESTING',
  COOLDOWN = 'COOLDOWN',
  MAX_BID_REACHED = 'MAX_BID_REACHED',
  RANK_CHECK_FAILED = 'RANK_CHECK_FAILED',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}

export enum BidDecision {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
  DECREASE_TEST = 'DECREASE_TEST',
  RESTORE_STABLE_BID = 'RESTORE_STABLE_BID',
  HOLD = 'HOLD',
  COOLDOWN = 'COOLDOWN',
  MAX_BID_REACHED = 'MAX_BID_REACHED',
  MIN_BID_REACHED = 'MIN_BID_REACHED',
  RANK_CHECK_FAILED = 'RANK_CHECK_FAILED',
  PAUSED = 'PAUSED',
}

export enum Device {
  PC = 'PC',
  MOBILE = 'MOBILE',
}

export enum AdType {
  POWERLINK = 'POWERLINK',
  SHOPPING = 'SHOPPING',
  PLACE = 'PLACE',
}

// ─── Bidding Rule ────────────────────────────────────────────────────────────

export interface BiddingRule {
  id: string
  keywordId: string
  targetRank: number
  rankUpperBound: number
  rankLowerBound: number
  minBid: number
  maxBid: number
  baseStep: number
  device: Device
  region?: string
  cooldownMinutes: number
  isActive: boolean
  adType: AdType
  createdAt: Date
  updatedAt: Date
}

// ─── Rank Check ──────────────────────────────────────────────────────────────

export interface RankCheckResult {
  keyword: string
  device: Device
  region?: string
  rank: number | null
  found: boolean
  checkedAt: Date
  error?: string
}

// ─── Bid Job ─────────────────────────────────────────────────────────────────

export interface BidJobPayload {
  biddingRuleId: string
  keywordId: string
  adAccountId: string
  naverCustomerId: string
  naverKeywordId: string
  keyword: string
  currentBid: number
  device: Device
  region?: string
  targetRank: number
  minBid: number
  maxBid: number
  baseStep: number
  cooldownMinutes: number
}
