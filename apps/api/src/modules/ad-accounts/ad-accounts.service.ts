import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { NaverApiClient } from '../../naver/naver-api.client'
import { CreateAdAccountDto } from './dto/create-ad-account.dto'
import * as CryptoJS from 'crypto-js'

@Injectable()
export class AdAccountsService {
  private readonly logger = new Logger(AdAccountsService.name)
  private readonly encryptSecret = process.env.ENCRYPT_SECRET!

  constructor(
    private readonly prisma: PrismaService,
    private readonly naverApi: NaverApiClient,
  ) {}

  async findAll() {
    return this.prisma.adAccount.findMany({
      select: {
        id: true,
        accountName: true,
        naverCustomerId: true,
        status: true,
        lastSyncedAt: true,
        createdAt: true,
        _count: { select: { campaigns: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(dto: CreateAdAccountDto) {
    const accessLicenseEncrypted = CryptoJS.AES.encrypt(dto.accessLicense, this.encryptSecret).toString()
    const secretKeyEncrypted = CryptoJS.AES.encrypt(dto.secretKey, this.encryptSecret).toString()

    const workspace = await this.prisma.workspace.findFirst()
    if (!workspace) throw new BadRequestException('워크스페이스가 없습니다. 먼저 워크스페이스를 생성하세요.')

    return this.prisma.adAccount.create({
      data: {
        workspaceId: workspace.id,
        accountName: dto.accountName,
        naverCustomerId: dto.naverCustomerId,
        accessLicenseEncrypted,
        secretKeyEncrypted,
      },
      select: { id: true, accountName: true, naverCustomerId: true, status: true, createdAt: true },
    })
  }

  async syncFromNaver(id: string) {
    const account = await this.findAccountWithKeys(id)
    const { accessLicense, secretKey } = this.decryptKeys(account)

    // 처리한 Naver ID 추적 (삭제 감지용)
    const seenCampaignNaverIds = new Set<string>()
    const seenAdGroupNaverIds = new Set<string>()
    const seenKeywordNaverIds = new Set<string>()
    let keywordCount = 0

    // ─── 1. 캠페인 ────────────────────────────────────────────────────────
    const campaigns = await this.naverApi.getCampaigns(accessLicense, secretKey, account.naverCustomerId)

    for (const c of campaigns) {
      seenCampaignNaverIds.add(c.nccCampaignId)

      const campaign = await this.prisma.campaign.upsert({
        where: { naverCampaignId: c.nccCampaignId },
        create: {
          adAccountId: id,
          naverCampaignId: c.nccCampaignId,
          name: c.name,
          status: c.userLock ? 'PAUSED' : 'ACTIVE',
          campaignTp: c.campaignTp,
          dailyBudget: c.dailyBudget,
        },
        update: {
          name: c.name,
          status: c.userLock ? 'PAUSED' : 'ACTIVE',
          campaignTp: c.campaignTp,
          dailyBudget: c.dailyBudget,
          syncedAt: new Date(),
        },
      })

      // ─── 2. 광고그룹 ──────────────────────────────────────────────────
      const adGroups = await this.naverApi.getAdGroups(accessLicense, secretKey, account.naverCustomerId, c.nccCampaignId)

      for (const g of adGroups) {
        seenAdGroupNaverIds.add(g.nccAdgroupId)

        const adGroup = await this.prisma.adGroup.upsert({
          where: { naverAdgroupId: g.nccAdgroupId },
          create: {
            campaignId: campaign.id,
            naverAdgroupId: g.nccAdgroupId,
            name: g.name,
            status: g.userLock ? 'PAUSED' : 'ACTIVE',
            baseBid: g.bidAmt,
          },
          update: {
            name: g.name,
            status: g.userLock ? 'PAUSED' : 'ACTIVE',
            baseBid: g.bidAmt,
            syncedAt: new Date(),
          },
        })

        // ─── 3. 소재 → siteUrl 갱신 ───────────────────────────────────
        const adGroupSiteUrl = await this.extractSiteUrlFromAds(accessLicense, secretKey, account.naverCustomerId, g.nccAdgroupId)
        if (adGroupSiteUrl !== null) {
          await this.prisma.adGroup.update({ where: { id: adGroup.id }, data: { siteUrl: adGroupSiteUrl } })

          // siteUrl 변경 시 연결된 BiddingRule도 갱신
          await this.prisma.biddingRule.updateMany({
            where: { keyword: { adGroupId: adGroup.id } },
            data: { siteUrl: adGroupSiteUrl },
          })
        }

        // ─── 4. 키워드 ────────────────────────────────────────────────
        const keywords = await this.naverApi.getKeywords(accessLicense, secretKey, account.naverCustomerId, g.nccAdgroupId)

        for (const k of keywords) {
          seenKeywordNaverIds.add(k.nccKeywordId)

          await this.prisma.keyword.upsert({
            where: { naverKeywordId: k.nccKeywordId },
            create: {
              adGroupId: adGroup.id,
              naverKeywordId: k.nccKeywordId,
              keywordText: k.keyword,
              currentBid: k.bidAmt,
              status: k.userLock ? 'PAUSED' : 'ACTIVE',
              qualityScore: k.qscore,
            },
            update: {
              keywordText: k.keyword,
              currentBid: k.bidAmt,
              status: k.userLock ? 'PAUSED' : 'ACTIVE',
              qualityScore: k.qscore,
              lastSyncedAt: new Date(),
            },
          })
          keywordCount++
        }
      }
    }

    // ─── 5. 삭제 감지 ─────────────────────────────────────────────────────
    const removed = await this.markRemovedItems(id, seenCampaignNaverIds, seenAdGroupNaverIds, seenKeywordNaverIds)

    await this.prisma.adAccount.update({ where: { id }, data: { lastSyncedAt: new Date() } })

    this.logger.log(
      `[${account.accountName}] 동기화 완료 — 캠페인 ${campaigns.length}, 키워드 ${keywordCount}` +
      (removed.keywords > 0 ? ` / 삭제 감지: 키워드 ${removed.keywords}개` : ''),
    )

    return { message: '동기화 완료', campaigns: campaigns.length, keywords: keywordCount, removed }
  }

  private async markRemovedItems(
    adAccountId: string,
    seenCampaignNaverIds: Set<string>,
    seenAdGroupNaverIds: Set<string>,
    seenKeywordNaverIds: Set<string>,
  ) {
    // API가 아무것도 안 돌려준 경우는 네트워크 오류로 간주, 삭제 처리 안 함
    if (!seenCampaignNaverIds.size) return { campaigns: 0, adGroups: 0, keywords: 0 }

    // 캠페인 삭제
    const dbCampaigns = await this.prisma.campaign.findMany({
      where: { adAccountId, status: { not: 'REMOVED' } },
      select: { id: true, naverCampaignId: true },
    })
    const removedCampaignIds = dbCampaigns
      .filter(c => !seenCampaignNaverIds.has(c.naverCampaignId))
      .map(c => c.id)

    if (removedCampaignIds.length) {
      await this.prisma.campaign.updateMany({
        where: { id: { in: removedCampaignIds } },
        data: { status: 'REMOVED' },
      })
    }

    // 광고그룹 삭제
    const dbAdGroups = await this.prisma.adGroup.findMany({
      where: { campaign: { adAccountId }, status: { not: 'REMOVED' } },
      select: { id: true, naverAdgroupId: true },
    })
    const removedAdGroupIds = dbAdGroups
      .filter(g => !seenAdGroupNaverIds.has(g.naverAdgroupId))
      .map(g => g.id)

    if (removedAdGroupIds.length) {
      await this.prisma.adGroup.updateMany({
        where: { id: { in: removedAdGroupIds } },
        data: { status: 'REMOVED' },
      })
    }

    // 키워드 삭제 + 연결된 자동입찰 비활성화
    const dbKeywords = await this.prisma.keyword.findMany({
      where: { adGroup: { campaign: { adAccountId } }, status: { not: 'REMOVED' } },
      select: { id: true, naverKeywordId: true },
    })
    const removedKeywordIds = dbKeywords
      .filter(k => !seenKeywordNaverIds.has(k.naverKeywordId))
      .map(k => k.id)

    if (removedKeywordIds.length) {
      await this.prisma.biddingRule.updateMany({
        where: { keywordId: { in: removedKeywordIds }, isActive: true },
        data: { isActive: false },
      })
      await this.prisma.keyword.updateMany({
        where: { id: { in: removedKeywordIds } },
        data: { status: 'REMOVED' },
      })
      this.logger.warn(`삭제된 키워드 ${removedKeywordIds.length}개 감지 → 자동입찰 비활성화`)
    }

    return {
      campaigns: removedCampaignIds.length,
      adGroups: removedAdGroupIds.length,
      keywords: removedKeywordIds.length,
    }
  }

  async remove(id: string) {
    await this.findAccountWithKeys(id)
    await this.prisma.adAccount.delete({ where: { id } })
    return { message: '삭제 완료' }
  }

  private async findAccountWithKeys(id: string) {
    const account = await this.prisma.adAccount.findUnique({ where: { id } })
    if (!account) throw new NotFoundException(`광고계정을 찾을 수 없습니다: ${id}`)
    return account
  }

  private decryptKeys(account: { accessLicenseEncrypted: string; secretKeyEncrypted: string }) {
    const accessLicense = CryptoJS.AES.decrypt(account.accessLicenseEncrypted, this.encryptSecret).toString(CryptoJS.enc.Utf8)
    const secretKey = CryptoJS.AES.decrypt(account.secretKeyEncrypted, this.encryptSecret).toString(CryptoJS.enc.Utf8)
    return { accessLicense, secretKey }
  }

  private async extractSiteUrlFromAds(
    accessLicense: string,
    secretKey: string,
    customerId: string,
    naverAdgroupId: string,
  ): Promise<string | null> {
    try {
      const ads = await this.naverApi.getAds(accessLicense, secretKey, customerId, naverAdgroupId)
      if (!ads.length) return null

      const candidates = ads.filter((a) => !a.userLock).length > 0 ? ads.filter((a) => !a.userLock) : ads

      const extractDomain = (url: string | undefined) => {
        if (!url) return null
        try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') }
      }

      const domains = [...new Set(candidates.map((a) => extractDomain(a.pcFinalUrl)).filter(Boolean) as string[])]
      return domains.length ? domains.join(',') : null
    } catch {
      return null
    }
  }
}
