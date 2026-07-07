import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'

interface FindAllParams {
  adAccountId?: string
  adGroupId?: string
  state?: string
  search?: string
  page: number
  limit: number
  sortBy?: string
  sortDir?: string
  biddingOnly?: boolean
}

@Injectable()
export class KeywordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ adAccountId, adGroupId, state, search, page, limit, sortBy = 'keywordText', sortDir = 'asc', biddingOnly }: FindAllParams) {
    const skip = (page - 1) * limit

    const where: any = {}

    if (search) {
      where.keywordText = { contains: search, mode: 'insensitive' }
    }

    if (adGroupId) {
      where.adGroupId = adGroupId
    } else if (adAccountId) {
      where.adGroup = { campaign: { adAccountId } }
    }

    if (biddingOnly && !state) {
      where.biddingRules = { some: { isActive: true } }
    }

    if (state) {
      where.biddingRules = { some: { biddingState: { state } } }
    }

    const orderBy = this.buildOrderBy(sortBy, sortDir)

    const [total, keywords] = await Promise.all([
      this.prisma.keyword.count({ where }),
      this.prisma.keyword.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          adGroup: {
            include: {
              campaign: { select: { id: true, name: true, adAccountId: true } },
            },
          },
          biddingRules: {
            where: { isActive: true },
            include: {
              biddingState: true,
              rankChecks: {
                take: 10,
                orderBy: { checkedAt: 'desc' as const },
                select: { rank: true, found: true, checkedAt: true, device: true },
              },
            },
            take: 1,
          },
        },
      }),
    ])

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: keywords.map((k) => ({
        id: k.id,
        keywordText: k.keywordText,
        currentBid: k.currentBid,
        status: k.status,
        campaignId: k.adGroup.campaign.id,
        campaignName: k.adGroup.campaign.name,
        adGroupId: k.adGroup.id,
        adGroupName: k.adGroup.name,
        biddingRule: k.biddingRules[0] ?? null,
        biddingState: k.biddingRules[0]?.biddingState ?? null,
        lastPcRankCheck: k.biddingRules[0]?.rankChecks.find((c: any) => c.device === 'PC') ?? null,
        lastMobileRankCheck: k.biddingRules[0]?.rankChecks.find((c: any) => c.device === 'MOBILE') ?? null,
      })),
    }
  }

  async getCampaignTree(adAccountId?: string, campaignTp?: string) {
    const where: any = adAccountId ? { adAccountId } : {}
    if (campaignTp) where.campaignTp = campaignTp
    const campaigns = await this.prisma.campaign.findMany({
      where,
      include: {
        adGroups: {
          include: {
            _count: { select: { keywords: true } },
          },
        },
        _count: { select: { adGroups: true } },
      },
      orderBy: { name: 'asc' },
    })

    return campaigns.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      campaignTp: c.campaignTp,
      adGroupCount: c._count.adGroups,
      adGroups: c.adGroups.map(g => ({
        id: g.id,
        name: g.name,
        status: g.status,
        keywordCount: g._count.keywords,
      })),
    }))
  }

  private buildOrderBy(sortBy: string, sortDir: string) {
    const dir = (sortDir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc'
    switch (sortBy) {
      case 'currentBid': return { currentBid: dir }
      case 'status': return { status: dir }
      case 'campaignName': return { adGroup: { campaign: { name: dir } } }
      case 'adGroupName': return { adGroup: { name: dir } }
      default: return { keywordText: dir }
    }
  }
}
