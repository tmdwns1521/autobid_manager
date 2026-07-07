import { Injectable, Logger } from '@nestjs/common'
import { NaverApiClient } from '../../naver/naver-api.client'
import { Device, RankCheckResult } from '@autobid/shared'
import { NaverSearchScraperService } from './naver-search-scraper.service'

export interface RankCheckInput {
  keyword: string
  naverKeywordId: string
  customerId: string
  accessLicense: string
  secretKey: string
  device: Device
  region?: string
  siteUrl?: string
}

@Injectable()
export class RankCheckerService {
  private readonly logger = new Logger(RankCheckerService.name)

  constructor(
    private readonly naverApi: NaverApiClient,
    private readonly scraper: NaverSearchScraperService,
  ) {}

  async check(input: RankCheckInput): Promise<RankCheckResult> {
    this.logger.debug(`순위 조회: [${input.keyword}] ${input.device}`)

    if (input.siteUrl) {
      return this.checkByScraping(input)
    }
    return this.checkByStatsApi(input)
  }

  private async checkByScraping(input: RankCheckInput): Promise<RankCheckResult> {
    try {
      const result = await this.scraper.scrapeRank(input.keyword, input.siteUrl!, input.device)
      return {
        keyword: input.keyword,
        device: input.device,
        region: input.region,
        rank: result.rank,
        found: result.found,
        checkedAt: new Date(),
        error: result.error,
      }
    } catch (err: any) {
      this.logger.error(`스크래핑 순위 조회 실패 [${input.keyword}]: ${err.message}`)
      return { keyword: input.keyword, device: input.device, region: input.region, rank: null, found: false, checkedAt: new Date(), error: err.message }
    }
  }

  private async checkByStatsApi(input: RankCheckInput): Promise<RankCheckResult> {
    try {
      const stats = await this.naverApi.getKeywordStats(
        input.accessLicense,
        input.secretKey,
        input.customerId,
        input.naverKeywordId,
      )

      const rank = stats.avgRnk !== null ? Math.round(stats.avgRnk) : null
      const found = rank !== null && stats.impCnt > 0

      return { keyword: input.keyword, device: input.device, region: input.region, rank, found, checkedAt: new Date() }
    } catch (err: any) {
      this.logger.error(`순위 조회 실패 [${input.keyword}]: ${err.message}`)
      return { keyword: input.keyword, device: input.device, region: input.region, rank: null, found: false, checkedAt: new Date(), error: err.message }
    }
  }
}
