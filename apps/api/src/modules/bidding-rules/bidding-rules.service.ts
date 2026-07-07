import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import * as CryptoJS from 'crypto-js'
import { PrismaService } from '../../database/prisma.service'
import { NaverApiClient } from '../../naver/naver-api.client'
import { CreateBiddingRuleDto } from './dto/create-bidding-rule.dto'
import { BiddingState, BidJobPayload, QUEUE_NAMES, BIDDING_DEFAULTS } from '@autobid/shared'

@Injectable()
export class BiddingRulesService {
  private readonly logger = new Logger(BiddingRulesService.name)
  private readonly encryptSecret = process.env.ENCRYPT_SECRET!

  constructor(
    private readonly prisma: PrismaService,
    private readonly naverApi: NaverApiClient,
    @InjectQueue(QUEUE_NAMES.BID_JOB) private readonly bidQueue: Queue<BidJobPayload>,
  ) {}

  async create(dto: CreateBiddingRuleDto) {
    await this.prisma.biddingRule.updateMany({
      where: { keywordId: dto.keywordId, isActive: true },
      data: { isActive: false },
    })

    const keyword = await this.prisma.keyword.findUnique({
      where: { id: dto.keywordId },
      include: {
        adGroup: { include: { campaign: { include: { adAccount: true } } } },
      },
    })
    if (!keyword) throw new NotFoundException(`Keyword not found: ${dto.keywordId}`)

    const adAccount = keyword.adGroup.campaign.adAccount
    const device = ((dto.device ?? 'MOBILE') as string).toUpperCase() as 'PC' | 'MOBILE'

    // maxBid 자동 계산 — "안 막히게 넉넉히 + 전역 안전상한"
    // 기본값: 현재가 × N (넉넉한 상한). estimate는 현재가보다 유의미하게 높을 때만 신뢰한다.
    // (네이버 estimate는 데이터 부족 시 최저가 70원을 반환해서, 그대로 쓰면 maxBid가 비현실적으로 낮아짐)
    const fallbackMax = Math.ceil((keyword.currentBid * BIDDING_DEFAULTS.AUTO_MAX_BID_MULTIPLIER) / 10) * 10
    let maxBid = dto.maxBid ?? fallbackMax
    if (!dto.maxBid) {
      try {
        const accessLicense = CryptoJS.AES.decrypt(adAccount.accessLicenseEncrypted, this.encryptSecret).toString(CryptoJS.enc.Utf8)
        const secretKey = CryptoJS.AES.decrypt(adAccount.secretKeyEncrypted, this.encryptSecret).toString(CryptoJS.enc.Utf8)

        const estimatedBid = await this.naverApi.estimateBidForRank(
          accessLicense, secretKey, adAccount.naverCustomerId,
          keyword.naverKeywordId, dto.targetRank, device,
        )
        if (estimatedBid && estimatedBid > keyword.currentBid) {
          // 평균 입찰가의 150% vs 폴백 중 더 큰 값 (안 막히게)
          const estimateBased = Math.ceil((estimatedBid * 1.5) / 10) * 10
          maxBid = Math.max(fallbackMax, estimateBased)
          this.logger.log(`[${keyword.keywordText}] ${dto.targetRank}위 평균입찰가: ${estimatedBid}원 → maxBid: ${maxBid}원`)
        } else {
          this.logger.log(`[${keyword.keywordText}] estimate(${estimatedBid}원)가 현재가 이하 — 폴백 사용 maxBid: ${maxBid}원`)
        }
      } catch (err: any) {
        this.logger.warn(`[${keyword.keywordText}] 평균입찰가 조회 실패, 폴백 사용(현재가×${BIDDING_DEFAULTS.AUTO_MAX_BID_MULTIPLIER}): ${err.message}`)
      }
    }

    // 전역 회로차단기로 클램프 (어떤 경우에도 이 이상은 안 됨)
    maxBid = Math.min(maxBid, BIDDING_DEFAULTS.GLOBAL_MAX_BID_CEILING)

    // siteUrl 미입력 시 소재 API로 자동 감지
    let siteUrl = dto.siteUrl ?? null
    if (!siteUrl) {
      siteUrl = await this.detectSiteUrl(dto.keywordId, device)
      if (siteUrl) this.logger.log(`[${keyword.keywordText}] 사이트 URL 자동 감지: ${siteUrl}`)
    }

    this.logger.log(`[${keyword.keywordText}] 규칙 생성 — 현재입찰가: ${keyword.currentBid}원, maxBid 상한: ${maxBid}원`)

    const rule = await this.prisma.biddingRule.create({
      data: {
        keywordId: dto.keywordId,
        targetRank: dto.targetRank,
        rankUpperBound: dto.rankUpperBound ?? dto.targetRank,
        rankLowerBound: dto.rankLowerBound ?? dto.targetRank + 1,
        minBid: dto.minBid,
        maxBid,
        baseStep: dto.baseStep ?? 100,
        device,
        region: dto.region,
        cooldownMinutes: dto.cooldownMinutes ?? BIDDING_DEFAULTS.COOLDOWN_MINUTES,
        isActive: dto.isActive ?? true,
        siteUrl,
      },
    })

    await this.prisma.biddingState.create({
      data: { biddingRuleId: rule.id, state: BiddingState.SEARCHING },
    })

    return { ...rule, maxBid }
  }

  async detectSiteUrl(keywordId: string, _device: string): Promise<string | null> {
    const keyword = await this.prisma.keyword.findUnique({
      where: { id: keywordId },
      include: { adGroup: { select: { siteUrl: true } } },
    })
    return keyword?.adGroup?.siteUrl ?? null
  }

  async update(id: string, dto: Partial<CreateBiddingRuleDto>) {
    const rule = await this.prisma.biddingRule.findUnique({ where: { id } })
    if (!rule) throw new NotFoundException(`BiddingRule not found: ${id}`)
    return this.prisma.biddingRule.update({ where: { id }, data: dto })
  }

  async toggle(id: string, isActive: boolean) {
    const rule = await this.prisma.biddingRule.findUnique({ where: { id } })
    if (!rule) throw new NotFoundException(`BiddingRule not found: ${id}`)
    return this.prisma.biddingRule.update({ where: { id }, data: { isActive } })
  }

  async trigger(id: string) {
    const rule = await this.prisma.biddingRule.findUnique({
      where: { id },
      include: {
        keyword: {
          include: { adGroup: { include: { campaign: { include: { adAccount: true } } } } },
        },
      },
    })
    if (!rule) throw new NotFoundException(`BiddingRule not found: ${id}`)

    const { keyword } = rule
    const adAccount = keyword.adGroup.campaign.adAccount

    const jobId = `bid-rule-manual-${id}-${Date.now()}`
    const payload: BidJobPayload = {
      biddingRuleId: rule.id,
      keywordId: rule.keywordId,
      adAccountId: adAccount.id,
      naverCustomerId: adAccount.naverCustomerId,
      naverKeywordId: keyword.naverKeywordId,
      naverAdGroupId: keyword.adGroup.naverAdgroupId,
      keyword: keyword.keywordText,
      currentBid: keyword.currentBid,
      device: rule.device as any,
      region: rule.region ?? undefined,
      targetRank: rule.targetRank,
      minBid: rule.minBid,
      maxBid: rule.maxBid,
      baseStep: rule.baseStep,
      cooldownMinutes: rule.cooldownMinutes,
      siteUrl: rule.siteUrl ?? undefined,
    }

    await this.bidQueue.add(payload, { jobId, attempts: 1, removeOnComplete: true, removeOnFail: false })
    this.logger.log(`수동 실행: [${keyword.keywordText}] 규칙 ${id}`)
    return { message: `[${keyword.keywordText}] 입찰 작업 시작됨`, jobId }
  }

  async setManualBid(ruleId: string, bidAmt: number): Promise<{ success: boolean }> {
    const rule = await this.prisma.biddingRule.findUnique({
      where: { id: ruleId },
      include: {
        keyword: {
          include: { adGroup: { include: { campaign: { include: { adAccount: true } } } } },
        },
      },
    })
    if (!rule) throw new NotFoundException(`BiddingRule not found: ${ruleId}`)

    const { keyword } = rule
    const adAccount = keyword.adGroup.campaign.adAccount
    const accessLicense = CryptoJS.AES.decrypt(adAccount.accessLicenseEncrypted, this.encryptSecret).toString(CryptoJS.enc.Utf8)
    const secretKey = CryptoJS.AES.decrypt(adAccount.secretKeyEncrypted, this.encryptSecret).toString(CryptoJS.enc.Utf8)

    await this.naverApi.updateKeywordBid(
      accessLicense, secretKey, adAccount.naverCustomerId,
      keyword.naverKeywordId, keyword.adGroup.naverAdgroupId, bidAmt,
    )
    await this.prisma.keyword.update({ where: { id: keyword.id }, data: { currentBid: bidAmt } })
    this.logger.log(`[${keyword.keywordText}] 수동 입찰가 설정: ${bidAmt}원`)
    return { success: true }
  }

  async setGroupMaxBid(adGroupId: string, maxBid: number): Promise<{ updated: number }> {
    const result = await this.prisma.biddingRule.updateMany({
      where: { keyword: { adGroupId } },
      data: { maxBid },
    })
    this.logger.log(`그룹 ${adGroupId} maxBid 일괄 설정: ${maxBid}원 (${result.count}개)`)
    return { updated: result.count }
  }

  async remove(id: string) {
    await this.prisma.biddingRule.findUnique({ where: { id } })
    await this.prisma.biddingState.deleteMany({ where: { biddingRuleId: id } })
    await this.prisma.biddingRule.delete({ where: { id } })
    return { message: '삭제 완료' }
  }
}
