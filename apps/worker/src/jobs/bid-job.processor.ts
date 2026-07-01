import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { PrismaService } from '../../../api/src/database/prisma.service'
import { NaverApiClient } from '../../../api/src/naver/naver-api.client'
import { RankCheckerService } from './rank-checker.service'
import { decideBid, BiddingContext } from '../engines/bidding.engine'
import { QUEUE_NAMES, BidJobPayload, BiddingState, BidDecision } from '@autobid/shared'
import * as CryptoJS from 'crypto-js'

@Processor(QUEUE_NAMES.BID_JOB)
export class BidJobProcessor {
  private readonly logger = new Logger(BidJobProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly naverApi: NaverApiClient,
    private readonly rankChecker: RankCheckerService,
  ) {}

  @Process()
  async handleBidJob(job: Job<BidJobPayload>) {
    const payload = job.data
    this.logger.log(`처리 중: [${payload.keyword}] 규칙 ${payload.biddingRuleId}`)

    // 1. 광고계정 API 키 복호화
    const adAccount = await this.prisma.adAccount.findUnique({
      where: { id: payload.adAccountId },
    })
    if (!adAccount) throw new Error(`AdAccount not found: ${payload.adAccountId}`)

    const secretKey = process.env.ENCRYPT_SECRET!
    const accessLicense = CryptoJS.AES.decrypt(adAccount.accessLicenseEncrypted, secretKey).toString(CryptoJS.enc.Utf8)
    const apiSecretKey = CryptoJS.AES.decrypt(adAccount.secretKeyEncrypted, secretKey).toString(CryptoJS.enc.Utf8)

    // 2. 현재 순위 조회
    const rankResult = await this.rankChecker.check({
      keyword: payload.keyword,
      customerId: payload.naverCustomerId,
      device: payload.device,
      region: payload.region,
    })

    await this.prisma.rankCheck.create({
      data: {
        keywordId: payload.keywordId,
        biddingRuleId: payload.biddingRuleId,
        checkedKeyword: payload.keyword,
        device: payload.device,
        region: payload.region,
        rank: rankResult.rank,
        found: rankResult.found,
        status: rankResult.found ? 'SUCCESS' : (rankResult.error ? 'FAILED' : 'NOT_FOUND'),
        errorMessage: rankResult.error,
      },
    })

    // 3. 현재 입찰 상태 로드
    const state = await this.prisma.biddingState.upsert({
      where: { biddingRuleId: payload.biddingRuleId },
      create: {
        biddingRuleId: payload.biddingRuleId,
        state: BiddingState.SEARCHING,
      },
      update: { lastCheckedAt: new Date() },
    })

    // 4. 최신 currentBid 가져오기
    const keyword = await this.prisma.keyword.findUnique({ where: { id: payload.keywordId } })
    const currentBid = keyword?.currentBid ?? payload.currentBid

    // 5. 입찰 판단
    const rule = await this.prisma.biddingRule.findUnique({ where: { id: payload.biddingRuleId } })
    if (!rule) throw new Error(`BiddingRule not found: ${payload.biddingRuleId}`)

    const ctx: BiddingContext = {
      currentRank: rankResult.rank,
      targetRank: rule.targetRank,
      rankUpperBound: rule.rankUpperBound,
      rankLowerBound: rule.rankLowerBound,
      currentBid,
      minBid: rule.minBid,
      maxBid: rule.maxBid,
      baseStep: rule.baseStep,
      state: state.state as BiddingState,
      stableCount: state.stableCount,
      stableBid: state.stableBid,
      lastBidChangedAt: state.lastBidChangedAt,
      noRankChangeCount: state.noRankChangeCount,
      cooldownUntil: state.cooldownUntil,
      lastSuccessRank: state.lastSuccessRank,
    }

    const decision = decideBid(ctx)
    this.logger.log(`[${payload.keyword}] 판단: ${decision.decision} → ${decision.newBid}원 / ${decision.reason}`)

    // 6. 입찰가 변경 (실제 변경이 필요한 경우만)
    let apiResult: string | undefined
    let apiSuccess: boolean | undefined

    const needsApiCall = [BidDecision.INCREASE, BidDecision.DECREASE, BidDecision.DECREASE_TEST, BidDecision.RESTORE_STABLE_BID].includes(decision.decision)

    if (needsApiCall && decision.newBid !== currentBid) {
      try {
        const result = await this.naverApi.updateKeywordBid(
          accessLicense,
          apiSecretKey,
          payload.naverCustomerId,
          payload.naverKeywordId,
          decision.newBid,
        )
        apiResult = result.message
        apiSuccess = result.success

        await this.prisma.keyword.update({
          where: { id: payload.keywordId },
          data: { currentBid: decision.newBid },
        })
      } catch (err: any) {
        apiResult = err.message
        apiSuccess = false
        this.logger.error(`API 호출 실패 [${payload.keyword}]: ${err.message}`)
      }
    }

    // 7. 변경 로그 저장
    await this.prisma.bidChange.create({
      data: {
        keywordId: payload.keywordId,
        biddingRuleId: payload.biddingRuleId,
        beforeBid: currentBid,
        afterBid: decision.newBid,
        beforeRank: rankResult.rank,
        decision: decision.decision,
        reason: decision.reason,
        apiResult,
        apiSuccess,
      },
    })

    // 8. 상태 업데이트
    const cooldownUntil = needsApiCall && apiSuccess
      ? new Date(Date.now() + rule.cooldownMinutes * 60_000)
      : null

    await this.prisma.biddingState.update({
      where: { biddingRuleId: payload.biddingRuleId },
      data: {
        state: decision.nextState,
        lastCheckedAt: new Date(),
        lastBidChangedAt: needsApiCall && apiSuccess ? new Date() : state.lastBidChangedAt,
        stableBid: decision.stableBid !== undefined ? decision.stableBid : state.stableBid,
        stableCount: decision.stableCount ?? state.stableCount,
        lastSuccessRank: rankResult.rank ?? state.lastSuccessRank,
        cooldownUntil,
        noRankChangeCount: decision.noRankChangeCount ?? state.noRankChangeCount,
        failCount: decision.decision === BidDecision.RANK_CHECK_FAILED ? state.failCount + 1 : 0,
      },
    })
  }
}
