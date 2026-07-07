import { Module } from '@nestjs/common'
import { AdAccountsController } from './ad-accounts.controller'
import { AdAccountsService } from './ad-accounts.service'
import { SyncSchedulerService } from './sync-scheduler.service'
import { NaverModule } from '../../naver/naver.module'

@Module({
  imports: [NaverModule],
  controllers: [AdAccountsController],
  providers: [AdAccountsService, SyncSchedulerService],
  exports: [AdAccountsService],
})
export class AdAccountsModule {}
