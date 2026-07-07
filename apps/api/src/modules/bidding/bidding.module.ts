import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { QUEUE_NAMES } from '@autobid/shared'
import { NaverModule } from '../../naver/naver.module'
import { RankCheckerService } from './rank-checker.service'
import { BidJobProcessor } from './bid-job.processor'
import { BidScheduler } from './bid-scheduler'
import { NaverSearchScraperService } from './naver-search-scraper.service'
import { RankCheckController } from './rank-check.controller'

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.BID_JOB }),
    NaverModule,
  ],
  controllers: [RankCheckController],
  providers: [NaverSearchScraperService, RankCheckerService, BidJobProcessor, BidScheduler],
})
export class BiddingModule {}
