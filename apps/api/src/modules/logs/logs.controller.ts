import { Controller, Get, Query } from '@nestjs/common'
import { LogsService } from './logs.service'

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('rank-history')
  rankHistory(
    @Query('keywordId') keywordId: string,
    @Query('limit') limit?: string,
  ) {
    return this.logsService.getRankHistory(keywordId, limit ? +limit : 100)
  }

  @Get('bid-changes')
  bidChanges(
    @Query('keywordId') keywordId?: string,
    @Query('keywordText') keywordText?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.logsService.bidChanges({
      keywordId,
      keywordText,
      limit: limit ? Math.min(+limit, 200) : 50,
      offset: offset ? +offset : 0,
    })
  }

  @Get('rank-changes')
  rankChanges(
    @Query('keywordId') keywordId?: string,
    @Query('keywordText') keywordText?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.logsService.rankChanges({
      keywordId,
      keywordText,
      limit: limit ? Math.min(+limit, 200) : 50,
      offset: offset ? +offset : 0,
    })
  }

  @Get()
  list(
    @Query('keywordId') keywordId?: string,
    @Query('keywordText') keywordText?: string,
    @Query('decision') decision?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.logsService.list({
      keywordId,
      keywordText,
      decision,
      limit: limit ? Math.min(+limit, 200) : 50,
      offset: offset ? +offset : 0,
    })
  }
}
