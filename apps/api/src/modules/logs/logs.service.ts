import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  // 등수변경 델타는 최대 5,000행을 훑어 계산하므로, 짧은 주기 폴링(15초)에 대비해
  // 잠깐 캐시한다. 데이터는 5분 주기로만 바뀌므로 10초 staleness는 체감되지 않는다.
  private rankChangesCache = new Map<string, { at: number; changes: any[] }>()
  private static readonly RANK_CHANGES_TTL_MS = 10_000

  async getRankHistory(keywordId: string, limit = 100) {
    const rows = await this.prisma.bidChange.findMany({
      where: { keywordId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 200),
      include: { keyword: { select: { keywordText: true } } },
    })

    return {
      keywordText: rows[0]?.keyword.keywordText ?? '',
      data: rows.map((r) => ({
        id: r.id,
        checkedAt: r.createdAt,
        rank: r.beforeRank,
        bid: r.afterBid,
        decision: r.decision,
      })),
    }
  }

  async list(params: {
    keywordId?: string
    keywordText?: string
    decision?: string
    limit?: number
    offset?: number
  }) {
    const { keywordId, keywordText, decision, limit = 50, offset = 0 } = params
    const take = Math.min(limit, 200)

    const where: any = {}
    if (keywordId) where.keywordId = keywordId
    if (decision) where.decision = decision
    if (keywordText) {
      where.keyword = { keywordText: { contains: keywordText, mode: 'insensitive' } }
    }

    const [data, total] = await Promise.all([
      this.prisma.bidChange.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
        include: { keyword: { select: { keywordText: true } } },
      }),
      this.prisma.bidChange.count({ where }),
    ])

    return {
      data: data.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        keywordId: r.keywordId,
        keywordText: r.keyword.keywordText,
        biddingRuleId: r.biddingRuleId,
        beforeBid: r.beforeBid,
        afterBid: r.afterBid,
        beforeRank: r.beforeRank,
        decision: r.decision,
        reason: r.reason,
        apiSuccess: r.apiSuccess,
      })),
      total,
    }
  }

  /**
   * 실제 가격이 변경된 로그만.
   * apiSuccess=true는 네이버 API 호출이 성공했다는 뜻인데, 프로세서는
   * newBid !== currentBid 일 때만 API를 호출하므로 곧 "실제 입찰가가 바뀜"과 동치다.
   */
  async bidChanges(params: {
    keywordId?: string
    keywordText?: string
    limit?: number
    offset?: number
  }) {
    const { keywordId, keywordText, limit = 50, offset = 0 } = params
    const take = Math.min(limit, 200)

    const where: any = { apiSuccess: true }
    if (keywordId) where.keywordId = keywordId
    if (keywordText) where.keyword = { keywordText: { contains: keywordText, mode: 'insensitive' } }

    const [data, total] = await Promise.all([
      this.prisma.bidChange.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
        include: { keyword: { select: { keywordText: true } } },
      }),
      this.prisma.bidChange.count({ where }),
    ])

    return {
      data: data.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        keywordId: r.keywordId,
        keywordText: r.keyword.keywordText,
        decision: r.decision,
        reason: r.reason,
        beforeBid: r.beforeBid,
        afterBid: r.afterBid,
        diff: r.afterBid - r.beforeBid,
        beforeRank: r.beforeRank,
      })),
      total,
    }
  }

  /**
   * 실제 등수가 변경된 로그만 (델타).
   * RankCheck는 매 사이클 순위를 저장하므로, 성공 조회를 시간순으로 훑으면서
   * 키워드별 직전 순위와 다를 때만 변경으로 기록한다. (스키마상 "이전 순위"가 없어 계산으로 도출)
   */
  async rankChanges(params: {
    keywordId?: string
    keywordText?: string
    limit?: number
    offset?: number
  }) {
    const { keywordId, keywordText, limit = 50, offset = 0 } = params
    const take = Math.min(limit, 200)

    // 필터별로 계산된 전체 변경 목록을 짧게 캐시하고, 페이지네이션은 캐시 위에서 슬라이스한다.
    const cacheKey = `${keywordId ?? ''}|${keywordText ?? ''}`
    const cached = this.rankChangesCache.get(cacheKey)
    const changes =
      cached && Date.now() - cached.at < LogsService.RANK_CHANGES_TTL_MS
        ? cached.changes
        : await this.computeRankChanges(keywordId, keywordText)

    if (!cached || Date.now() - cached.at >= LogsService.RANK_CHANGES_TTL_MS) {
      this.rankChangesCache.set(cacheKey, { at: Date.now(), changes })
    }

    return { data: changes.slice(offset, offset + take), total: changes.length }
  }

  private async computeRankChanges(keywordId?: string, keywordText?: string) {
    const where: any = { found: true, rank: { not: null } }
    if (keywordId) where.keywordId = keywordId
    if (keywordText) where.keyword = { keywordText: { contains: keywordText, mode: 'insensitive' } }

    // 델타 계산엔 연속된 이력이 필요해 최근 성공조회를 넉넉히 스캔한다.
    // (키워드 필터가 없을 때 무한 스캔을 막는 상한)
    const SCAN_CAP = 5000
    const rows = await this.prisma.rankCheck.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      take: SCAN_CAP,
      include: { keyword: { select: { keywordText: true } } },
    })

    // 오래된→최신 순으로 뒤집어 키워드별 직전 순위와 비교
    const lastRank = new Map<string, number>()
    const changes: Array<{
      id: string
      checkedAt: Date
      keywordId: string
      keywordText: string
      device: string
      region: string | null
      fromRank: number
      toRank: number
      diff: number
    }> = []

    for (const r of [...rows].reverse()) {
      const prev = lastRank.get(r.keywordId)
      lastRank.set(r.keywordId, r.rank as number)
      if (prev === undefined) continue // 첫 조회는 기준점 (변경 아님)
      if (r.rank !== prev) {
        changes.push({
          id: r.id,
          checkedAt: r.checkedAt,
          keywordId: r.keywordId,
          keywordText: r.keyword.keywordText,
          device: r.device,
          region: r.region,
          fromRank: prev,
          toRank: r.rank as number,
          diff: (r.rank as number) - prev, // 음수=순위 상승, 양수=하락
        })
      }
    }

    changes.sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())
    return changes
  }
}
