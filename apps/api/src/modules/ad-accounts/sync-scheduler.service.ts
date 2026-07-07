import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../database/prisma.service'
import { AdAccountsService } from './ad-accounts.service'

@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly adAccountsService: AdAccountsService,
  ) {}

  // 1시간마다 전체 광고계정 자동 동기화
  @Cron('0 * * * *')
  async autoSync() {
    const accounts = await this.prisma.adAccount.findMany({
      where: { status: 'active' },
      select: { id: true, accountName: true },
    })

    if (!accounts.length) return

    this.logger.log(`자동 동기화 시작 (${accounts.length}개 계정)`)

    for (const account of accounts) {
      try {
        const result = await this.adAccountsService.syncFromNaver(account.id)
        this.logger.log(`[${account.accountName}] 동기화 완료 — 키워드 ${result.keywords}개`)
      } catch (err: any) {
        this.logger.error(`[${account.accountName}] 동기화 실패: ${err.message}`)
      }
    }
  }
}
