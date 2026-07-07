import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { BiddingRulesController } from './bidding-rules.controller'
import { BiddingRulesService } from './bidding-rules.service'
import { NaverModule } from '../../naver/naver.module'
import { QUEUE_NAMES } from '@autobid/shared'

@Module({
  imports: [NaverModule, BullModule.registerQueue({ name: QUEUE_NAMES.BID_JOB })],
  controllers: [BiddingRulesController],
  providers: [BiddingRulesService],
})
export class BiddingRulesModule {}
