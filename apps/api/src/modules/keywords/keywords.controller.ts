import { Controller, Get, Query } from '@nestjs/common'
import { KeywordsService } from './keywords.service'

@Controller('keywords')
export class KeywordsController {
  constructor(private readonly service: KeywordsService) {}

  @Get()
  findAll(
    @Query('adAccountId') adAccountId?: string,
    @Query('adGroupId') adGroupId?: string,
    @Query('state') state?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('biddingOnly') biddingOnly?: string,
  ) {
    return this.service.findAll({
      adAccountId,
      adGroupId,
      state,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      sortBy,
      sortDir,
      biddingOnly: biddingOnly === 'true',
    })
  }

  @Get('tree')
  getTree(
    @Query('adAccountId') adAccountId?: string,
    @Query('campaignTp') campaignTp?: string,
  ) {
    return this.service.getCampaignTree(adAccountId, campaignTp)
  }
}
