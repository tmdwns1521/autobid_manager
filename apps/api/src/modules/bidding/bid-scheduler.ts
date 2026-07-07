import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { PrismaService } from '../../database/prisma.service'
import { QUEUE_NAMES, BidJobPayload } from '@autobid/shared'

@Injectable()
export class BidScheduler {
  private readonly logger = new Logger(BidScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.BID_JOB) private readonly bidQueue: Queue<BidJobPayload>,
  ) {}

  @Cron('*/3 * * * *') // 3분마다 (수렴 속도 위해 5분→3분)
  async scheduleActiveBidJobs() {
    this.logger.log('자동입찰 스케줄 시작')

    const activeRules = await this.prisma.biddingRule.findMany({
      where: { isActive: true },
      include: {
        keyword: {
          include: {
            adGroup: {
              include: { campaign: { include: { adAccount: true } } },
            },
          },
        },
        biddingState: true,
      },
    })

    let enqueued = 0
    const now = new Date()

    for (const rule of activeRules) {
      if (rule.biddingState?.cooldownUntil && rule.biddingState.cooldownUntil > now) continue

      const adAccount = rule.keyword.adGroup.campaign.adAccount
      const jobId = `bid-rule-${rule.id}`

      const existingJob = await this.bidQueue.getJob(jobId)
      if (existingJob && (await existingJob.isActive())) continue

      const payload: BidJobPayload = {
        biddingRuleId: rule.id,
        keywordId: rule.keywordId,
        adAccountId: adAccount.id,
        naverCustomerId: adAccount.naverCustomerId,
        naverKeywordId: rule.keyword.naverKeywordId,
        naverAdGroupId: rule.keyword.adGroup.naverAdgroupId,
        keyword: rule.keyword.keywordText,
        currentBid: rule.keyword.currentBid,
        device: rule.device as any,
        region: rule.region ?? undefined,
        targetRank: rule.targetRank,
        minBid: rule.minBid,
        maxBid: rule.maxBid,
        baseStep: rule.baseStep,
        cooldownMinutes: rule.cooldownMinutes,
        siteUrl: rule.siteUrl ?? undefined,
      }

      await this.bidQueue.add(payload, {
        jobId,
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      })
      enqueued++
    }

    this.logger.log(`${enqueued}/${activeRules.length}개 작업 등록`)
  }
}
