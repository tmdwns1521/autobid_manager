export const BIDDING_DEFAULTS = {
  CHECK_INTERVAL_MINUTES: 3, // 입찰 변경 후 반영 대기 (수렴 속도 위해 5→3분)
  COOLDOWN_MINUTES: 3,       // 변경 후 쿨다운 (5→3분)
  BASE_STEP: 100,
  MIN_DECREASE_UNIT: 10,
  MAX_INCREASE_MULTIPLIER: 5,
  STABLE_COUNT_THRESHOLD: 3,
  MAX_CHANGES_PER_HOUR: 6,
  MAX_CHANGES_PER_DAY: 50,
  RANK_CHECK_RETRY_LIMIT: 2,
  // 증액 성긴→정밀(coarse-to-fine) 스텝
  // 목표에서 멀면 크게 점프해 빠르게 접근, 가까워지면 baseStep으로 미세 조율
  COARSE_STEP: 1_500,       // gap >= COARSE_GAP_THRESHOLD
  MID_STEP: 700,            // gap >= MID_GAP_THRESHOLD
  NEAR_STEP: 400,           // gap 1~2 (목표 근처): 경쟁 대응 위해 정밀 스텝을 baseStep보다 크게
  COARSE_GAP_THRESHOLD: 5,
  MID_GAP_THRESHOLD: 3,
  // 입찰 상한 안전장치
  GLOBAL_MAX_BID_CEILING: 50_000, // 전역 회로차단기: 클릭당 절대 상한 (폭주 방지)
  AUTO_MAX_BID_MULTIPLIER: 5,     // 규칙 생성 시 기본 maxBid = 현재가 × N (넉넉한 상한)
  // 최저가 이진 탐색 수렴 기준: searchHigh - searchLow 가 이 값 이하면 탐색 종료
  BINARY_SEARCH_CONVERGENCE: 10,
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
export const API_RETRY_DELAYS_MS = [3_000, 6_000] // 3s, 6s (prod: 30s, 120s)
