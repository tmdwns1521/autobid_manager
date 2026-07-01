import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { PrismaService } from '../../../api/src/database/prisma.service'
import { QUEUE_NAMES, BidJobPayload } from '@autobid/shared'

@Injectable()
export class BidScheduler {
  private readonly logger = new Logger(BidScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.BID_JOB) private readonly bidQueue: Queue<BidJobPayload>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduleActiveBidJobs() {
    this.logger.log('자동입찰 스케줄 시작')

    const activeRules = await this.prisma.biddingRule.findMany({
      where: { isActive: true },
      include: {
        keyword: {
          include: {
            adGroup: {
              include: {
                campaign: {
                  include: { adAccount: true },
                },
              },
            },
          },
        },
        biddingState: true,
      },
    })

    let enqueued = 0
    const now = new Date()

    for (const rule of activeRules) {
      // 쿨다운 중인 키워드 스킵
      if (rule.biddingState?.cooldownUntil && rule.biddingState.cooldownUntil > now) {
        continue
      }

      const adAccount = rule.keyword.adGroup.campaign.adAccount
      const jobId = `bid-rule-${rule.id}` // 중복 실행 방지

      const existingJob = await this.bidQueue.getJob(jobId)
      if (existingJob && (await existingJob.isActive())) {
        this.logger.debug(`Skipping active job for rule ${rule.id}`)
        continue
      }

      const payload: BidJobPayload = {
        biddingRuleId: rule.id,
        keywordId: rule.keywordId,
        adAccountId: adAccount.id,
        naverCustomerId: adAccount.naverCustomerId,
        naverKeywordId: rule.keyword.naverKeywordId,
        keyword: rule.keyword.keywordText,
        currentBid: rule.keyword.currentBid,
        device: rule.device as any,
        region: rule.region ?? undefined,
        targetRank: rule.targetRank,
        minBid: rule.minBid,
        maxBid: rule.maxBid,
        baseStep: rule.baseStep,
        cooldownMinutes: rule.cooldownMinutes,
      }

      await this.bidQueue.add(payload, {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      })

      enqueued++
    }

    this.logger.log(`자동입찰 작업 ${enqueued}개 등록 완료 (전체 ${activeRules.length}개 중)`)
  }
}
