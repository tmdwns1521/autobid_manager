import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import * as crypto from 'crypto'
import { API_RETRY_DELAYS_MS } from '@autobid/shared'

const BASE_URL = 'https://api.searchad.naver.com'

@Injectable()
export class NaverApiClient {
  private readonly logger = new Logger(NaverApiClient.name)

  private buildClient(accessLicense: string, secretKey: string, customerId: string): AxiosInstance {
    const instance = axios.create({ baseURL: BASE_URL })

    instance.interceptors.request.use((config) => {
      const timestamp = Date.now().toString()
      const method = config.method!.toUpperCase()
      // 쿼리파라미터 제외한 path만 서명
      const path = config.url!.split('?')[0]
      this.logger.debug(`Signing: ${timestamp}.${method}.${path}`)
      const signature = this.sign(timestamp, method, path, secretKey)

      config.headers['X-Timestamp'] = timestamp
      config.headers['X-API-KEY'] = accessLicense
      config.headers['X-Customer'] = customerId
      config.headers['X-Signature'] = signature
      return config
    })

    return instance
  }

  private sign(timestamp: string, method: string, path: string, secretKey: string): string {
    const message = `${timestamp}.${method}.${path}`
    return crypto.createHmac('sha256', secretKey).update(message).digest('base64')
  }

  private async callWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
    try {
      return await fn()
    } catch (err: any) {
      const status = err.response?.status
      const detail = err.response ? `${status} ${JSON.stringify(err.response.data)}` : err.message
      // 4xx 에러는 재시도해도 의미 없음 (429 Too Many Requests 제외)
      if (retries <= 0 || (status && status >= 400 && status < 500 && status !== 429)) {
        this.logger.error(`API 최종 실패 [${detail}]`)
        throw err
      }
      const delay = API_RETRY_DELAYS_MS[API_RETRY_DELAYS_MS.length - retries] ?? 30_000
      this.logger.warn(`API call failed [${detail}], retrying in ${delay / 1000}s... (${retries} left)`)
      await new Promise((r) => setTimeout(r, delay))
      return this.callWithRetry(fn, retries - 1)
    }
  }

  async getCampaigns(accessLicense: string, secretKey: string, customerId: string) {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(() =>
      client.get('/ncc/campaigns').then((r) => r.data),
    )
  }

  async getAdGroups(accessLicense: string, secretKey: string, customerId: string, campaignId: string) {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(() =>
      client.get(`/ncc/adgroups?nccCampaignId=${campaignId}`).then((r) => r.data),
    )
  }

  async getKeywords(accessLicense: string, secretKey: string, customerId: string, adGroupId: string) {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(() =>
      client.get(`/ncc/keywords?nccAdgroupId=${adGroupId}`).then((r) => r.data),
    )
  }

  async updateKeywordBid(
    accessLicense: string,
    secretKey: string,
    customerId: string,
    naverKeywordId: string,
    naverAdGroupId: string,
    newBid: number,
  ): Promise<{ success: boolean; message?: string }> {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(async () => {
      // 그룹 입찰 해제(useGroupBidAmt=false) + 개별 입찰가 설정
      // 네이버 키워드 객체의 실제 필드명은 useGroupBidAmt (useGroupBidding 아님).
      // fields와 body 모두에 useGroupBidAmt를 함께 보내야 400(code 3916)이 안 남.
      const res = await client.put(`/ncc/keywords/${naverKeywordId}?fields=bidAmt,useGroupBidAmt`, {
        nccKeywordId: naverKeywordId,
        nccAdgroupId: naverAdGroupId,
        useGroupBidAmt: false,
        bidAmt: newBid,
      })
      return { success: true, message: JSON.stringify(res.data) }
    })
  }

  async getAdStatus(accessLicense: string, secretKey: string, customerId: string, keywordId: string) {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(() =>
      client.get(`/ncc/keywords/${keywordId}`).then((r) => r.data),
    )
  }

  async estimateBidForRank(
    accessLicense: string,
    secretKey: string,
    customerId: string,
    naverKeywordId: string,
    targetRank: number,
    device: 'PC' | 'MOBILE' = 'MOBILE',
  ): Promise<number | null> {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(async () => {
      const res = await client.post('/estimate/average-position-bid/id', {
        device,
        items: [{ key: naverKeywordId, position: targetRank }],
      })
      const estimate = res.data?.estimate?.[0]
      return estimate?.bid ?? null
    })
  }

  async getAds(
    accessLicense: string,
    secretKey: string,
    customerId: string,
    adGroupId: string,
  ): Promise<Array<{ nccAdId: string; pcFinalUrl?: string; mobileFinalUrl?: string; userLock?: boolean }>> {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(() =>
      client.get(`/ncc/ads?nccAdgroupId=${adGroupId}`).then((r) => r.data),
    )
  }

  async getKeywordStats(
    accessLicense: string,
    secretKey: string,
    customerId: string,
    naverKeywordId: string,
  ): Promise<{ avgRnk: number | null; impCnt: number }> {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const since = yesterday.toISOString().slice(0, 10) // YYYY-MM-DD
    const timeRange = JSON.stringify({ since, until: since })

    return this.callWithRetry(async () => {
      const res = await client.get('/stats', {
        params: {
          ids: naverKeywordId,
          fields: '["avgRnk","impCnt"]',
          timeRange,
        },
      })
      const stat = res.data?.summaryStatResponse?.[0]?.stat
      return {
        avgRnk: stat?.avgRnk ?? null,
        impCnt: stat?.impCnt ?? 0,
      }
    })
  }
}
