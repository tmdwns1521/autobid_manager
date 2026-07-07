import { Controller, Post, Patch, Delete, Get, Param, Body, Query } from '@nestjs/common'
import { BiddingRulesService } from './bidding-rules.service'
import { CreateBiddingRuleDto } from './dto/create-bidding-rule.dto'

@Controller('bidding-rules')
export class BiddingRulesController {
  constructor(private readonly service: BiddingRulesService) {}

  @Get('detect-site-url')
  detectSiteUrl(
    @Query('keywordId') keywordId: string,
    @Query('device') device: string,
  ) {
    return this.service.detectSiteUrl(keywordId, device).then((url) => ({ siteUrl: url }))
  }

  @Post()
  create(@Body() dto: CreateBiddingRuleDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateBiddingRuleDto>) {
    return this.service.update(id, dto)
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.service.toggle(id, isActive)
  }

  @Post(':id/trigger')
  trigger(@Param('id') id: string) {
    return this.service.trigger(id)
  }

  @Post(':id/set-bid')
  setManualBid(@Param('id') id: string, @Body('bidAmt') bidAmt: number) {
    return this.service.setManualBid(id, bidAmt)
  }

  @Post('group-max-bid')
  setGroupMaxBid(@Body('adGroupId') adGroupId: string, @Body('maxBid') maxBid: number) {
    return this.service.setGroupMaxBid(adGroupId, maxBid)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
