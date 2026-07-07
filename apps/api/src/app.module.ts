import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { BullModule } from '@nestjs/bull'
import { ScheduleModule } from '@nestjs/schedule'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { AdAccountsModule } from './modules/ad-accounts/ad-accounts.module'
import { CampaignsModule } from './modules/campaigns/campaigns.module'
import { KeywordsModule } from './modules/keywords/keywords.module'
import { BiddingRulesModule } from './modules/bidding-rules/bidding-rules.module'
import { LogsModule } from './modules/logs/logs.module'
import { ReportsModule } from './modules/reports/reports.module'
import { NaverModule } from './naver/naver.module'
import { BiddingModule } from './modules/bidding/bidding.module'
import { QUEUE_NAMES } from '@autobid/shared'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.BID_JOB },
      { name: QUEUE_NAMES.RANK_CHECK },
      { name: QUEUE_NAMES.NAVER_API },
      { name: QUEUE_NAMES.LOG },
    ),
    DatabaseModule,
    AuthModule,
    AdAccountsModule,
    CampaignsModule,
    KeywordsModule,
    BiddingRulesModule,
    LogsModule,
    ReportsModule,
    NaverModule,
    BiddingModule,
  ],
})
export class AppModule {}
