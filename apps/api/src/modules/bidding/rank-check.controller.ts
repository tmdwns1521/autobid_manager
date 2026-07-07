import { Controller, Get, Query, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { NaverSearchScraperService } from './naver-search-scraper.service'

@Controller('rank')
export class RankCheckController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: NaverSearchScraperService,
  ) {}

  @Get('check')
  async check(@Query('biddingRuleId') biddingRuleId: string) {
    if (!biddingRuleId) throw new BadRequestException('biddingRuleId가 필요합니다')

    const rule = await this.prisma.biddingRule.findUnique({
      where: { id: biddingRuleId },
      include: { keyword: { select: { keywordText: true } } },
    })
    if (!rule) throw new NotFoundException(`BiddingRule not found: ${biddingRuleId}`)
    if (!rule.siteUrl) {
      return { error: 'siteUrl 미설정 — 동기화 버튼을 눌러 자동 감지하거나 규칙 수정에서 직접 입력해주세요.' }
    }

    const result = await this.scraper.scrapeRankBoth(rule.keyword.keywordText, rule.siteUrl)
    return {
      keyword: rule.keyword.keywordText,
      siteUrl: rule.siteUrl,
      pc: result.pc,
      mobile: result.mobile,
      checkedAt: new Date(),
    }
  }
}
