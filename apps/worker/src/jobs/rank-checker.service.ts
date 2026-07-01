import { Injectable, Logger } from '@nestjs/common'
import { Device, RankCheckResult } from '@autobid/shared'

interface RankCheckInput {
  keyword: string
  customerId: string
  device: Device
  region?: string
}

/**
 * 순위 조회 서비스
 *
 * 현재: 광고 성과 API(노출 순위 리포트) 기반 구현 예정
 * 네이버 검색광고 API의 키워드 성과 리포트에서
 * 평균 노출 순위(avgRnk)를 참조하는 방식으로 구현.
 *
 * 실시간 화면 순위 조회가 필요한 경우 별도 엔진 연동 필요.
 */
@Injectable()
export class RankCheckerService {
  private readonly logger = new Logger(RankCheckerService.name)

  async check(input: RankCheckInput): Promise<RankCheckResult> {
    this.logger.log(`순위 조회: [${input.keyword}] ${input.device} ${input.region ?? '전국'}`)

    try {
      // TODO: 네이버 검색광고 API 성과 리포트 연동
      // GET /stats?fields=avgRnk&ids={keywordId}&timeRange=...
      // 현재는 플레이스홀더로 구현
      const rank = await this.fetchRankFromNaverApi(input)

      return {
        keyword: input.keyword,
        device: input.device,
        region: input.region,
        rank,
        found: rank !== null,
        checkedAt: new Date(),
      }
    } catch (err: any) {
      this.logger.error(`순위 조회 실패 [${input.keyword}]: ${err.message}`)
      return {
        keyword: input.keyword,
        device: input.device,
        region: input.region,
        rank: null,
        found: false,
        checkedAt: new Date(),
        error: err.message,
      }
    }
  }

  private async fetchRankFromNaverApi(input: RankCheckInput): Promise<number | null> {
    // 실제 구현: 네이버 검색광고 API /stats 엔드포인트 호출
    // 노출 순위(avgRnk) 필드를 가져와서 반환
    // 임시 반환 - 실제 API 연동 시 교체
    throw new Error('RankChecker: 네이버 API 연동이 필요합니다.')
  }
}
