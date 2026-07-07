import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import * as CryptoJS from 'crypto-js'
import { PrismaService } from '../../database/prisma.service'
import { NaverApiClient } from '../../naver/naver-api.client'
import { RankCheckerService } from './rank-checker.service'
import { decideBid, BiddingContext } from './bidding.engine'
import { QUEUE_NAMES, BidJobPayload, BiddingState, BidDecision, BIDDING_DEFAULTS } from '@autobid/shared'

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

    // 1. API 키 복호화
    const adAccount = await this.prisma.adAccount.findUnique({ where: { id: payload.adAccountId } })
    if (!adAccount) throw new Error(`AdAccount not found: ${payload.adAccountId}`)

    const encSecret = process.env.ENCRYPT_SECRET!
    const accessLicense = CryptoJS.AES.decrypt(adAccount.accessLicenseEncrypted, encSecret).toString(CryptoJS.enc.Utf8)
    const secretKey = CryptoJS.AES.decrypt(adAccount.secretKeyEncrypted, encSecret).toString(CryptoJS.enc.Utf8)

    // 2. 현재 순위 조회 (네이버 stats API avgRnk)
    const rankResult = await this.rankChecker.check({
      keyword: payload.keyword,
      naverKeywordId: payload.naverKeywordId,
      customerId: payload.naverCustomerId,
      accessLicense,
      secretKey,
      device: payload.device,
      region: payload.region,
      siteUrl: payload.siteUrl,
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

    // siteUrl이 있으면 반대 디바이스도 스크래핑 (대시보드 PC/Mobile 표시용 — 입찰 결정에 미사용)
    if (payload.siteUrl) {
      const otherDevice = payload.device === 'PC' ? 'MOBILE' : 'PC'
      try {
        const otherRank = await this.rankChecker.check({
          keyword: payload.keyword,
          naverKeywordId: payload.naverKeywordId,
          customerId: payload.naverCustomerId,
          accessLicense,
          secretKey,
          device: otherDevice as any,
          region: payload.region,
          siteUrl: payload.siteUrl,
        })
        await this.prisma.rankCheck.create({
          data: {
            keywordId: payload.keywordId,
            biddingRuleId: payload.biddingRuleId,
            checkedKeyword: payload.keyword,
            device: otherDevice,
            region: payload.region,
            rank: otherRank.rank,
            found: otherRank.found,
            status: otherRank.found ? 'SUCCESS' : (otherRank.error ? 'FAILED' : 'NOT_FOUND'),
            errorMessage: otherRank.error,
          },
        })
      } catch (err: any) {
        this.logger.warn(`[${payload.keyword}] ${otherDevice} 순위 조회 실패: ${err.message}`)
      }
    }

    // 3. 입찰 상태 로드/생성
    const state = await this.prisma.biddingState.upsert({
      where: { biddingRuleId: payload.biddingRuleId },
      create: { biddingRuleId: payload.biddingRuleId, state: BiddingState.SEARCHING },
      update: { lastCheckedAt: new Date() },
    })

    // 4. 최신 입찰가
    const keyword = await this.prisma.keyword.findUnique({ where: { id: payload.keywordId } })
    const currentBid = keyword?.currentBid ?? payload.currentBid

    // 5. 입찰 판단
    const rule = await this.prisma.biddingRule.findUnique({ where: { id: payload.biddingRuleId } })
    if (!rule) throw new Error(`BiddingRule not found: ${payload.biddingRuleId}`)

    // 5-1. 네이버 예상 입찰가 조회 (rankGap >= COARSE_GAP_THRESHOLD일 때만 — API 비용 절감)
    // estimate API는 "평균 낙찰가"를 반환하므로 현재가보다 낮으면 무시 (데이터 부족 시 70원 반환 문제)
    let estimatedBid: number | null = null
    if (rankResult.rank !== null) {
      const rankGap = rankResult.rank - rule.targetRank
      if (rankGap >= BIDDING_DEFAULTS.COARSE_GAP_THRESHOLD) {
        try {
          const raw = await this.naverApi.estimateBidForRank(
            accessLicense, secretKey, payload.naverCustomerId,
            payload.naverKeywordId, rule.targetRank, payload.device,
          )
          if (raw != null && raw > currentBid) {
            estimatedBid = raw
            this.logger.log(`[${payload.keyword}] estimate → ${estimatedBid.toLocaleString()}원 (목표 ${rule.targetRank}위, gap=${rankGap})`)
          } else {
            this.logger.log(`[${payload.keyword}] estimate(${raw}원) ≤ 현재가(${currentBid}원) — 스텝 폴백`)
          }
        } catch (err: any) {
          this.logger.warn(`[${payload.keyword}] estimate 조회 실패, 스텝 폴백: ${err.message}`)
        }
      }
    }

    const ctx: BiddingContext = {
      currentRank: rankResult.rank,
      targetRank: rule.targetRank,
      rankUpperBound: rule.rankUpperBound,
      rankLowerBound: rule.rankLowerBound,
      currentBid,
      minBid: rule.minBid,
      // 전역 회로차단기: 규칙 maxBid가 아무리 높아도 이 이상은 절대 입찰 안 함
      maxBid: Math.min(rule.maxBid, BIDDING_DEFAULTS.GLOBAL_MAX_BID_CEILING),
      baseStep: rule.baseStep,
      state: state.state as BiddingState,
      stableCount: state.stableCount,
      stableBid: state.stableBid,
      lastBidChangedAt: state.lastBidChangedAt,
      noRankChangeCount: state.noRankChangeCount,
      cooldownUntil: state.cooldownUntil,
      lastSuccessRank: state.lastSuccessRank,
      estimatedBid,
      searchLow: state.searchLow,
      searchHigh: state.searchHigh,
    }

    const decision = decideBid(ctx)
    this.logger.log(`[${payload.keyword}] ${decision.decision} → ${decision.newBid}원 (${decision.reason})`)

    // 6. 입찰가 변경 API 호출
    let apiResult: string | undefined
    let apiSuccess: boolean | undefined

    const needsApiCall = [
      BidDecision.INCREASE,
      BidDecision.DECREASE,
      BidDecision.DECREASE_TEST,
      BidDecision.RESTORE_STABLE_BID,
    ].includes(decision.decision)

    if (needsApiCall && decision.newBid !== currentBid) {
      try {
        const result = await this.naverApi.updateKeywordBid(
          accessLicense, secretKey, payload.naverCustomerId, payload.naverKeywordId, payload.naverAdGroupId, decision.newBid,
        )
        apiResult = result.message
        apiSuccess = result.success
        await this.prisma.keyword.update({ where: { id: payload.keywordId }, data: { currentBid: decision.newBid } })
      } catch (err: any) {
        // 네이버가 돌려주는 실제 에러 본문(code/title)을 저장해야 원인 진단이 가능함
        apiResult = err.response?.data ? JSON.stringify(err.response.data) : err.message
        apiSuccess = false
        this.logger.error(`입찰 API 실패 [${payload.keyword}]: ${apiResult}`)
      }
    }

    // 7. 변경 로그
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
        searchLow: decision.searchLow !== undefined ? decision.searchLow : state.searchLow,
        searchHigh: decision.searchHigh !== undefined ? decision.searchHigh : state.searchHigh,
      },
    })
  }
}
