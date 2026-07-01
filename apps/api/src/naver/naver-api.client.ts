import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import * as crypto from 'crypto'
import { API_RETRY_DELAYS_MS } from '@autobid/shared'

const BASE_URL = 'https://api.naver.com'

@Injectable()
export class NaverApiClient {
  private readonly logger = new Logger(NaverApiClient.name)

  private buildClient(accessLicense: string, secretKey: string, customerId: string): AxiosInstance {
    const instance = axios.create({ baseURL: BASE_URL })

    instance.interceptors.request.use((config) => {
      const timestamp = Date.now().toString()
      const signature = this.sign(timestamp, config.method!.toUpperCase(), config.url!, secretKey)

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
      if (retries <= 0) throw err
      const delay = API_RETRY_DELAYS_MS[API_RETRY_DELAYS_MS.length - retries] ?? 30_000
      this.logger.warn(`API call failed, retrying in ${delay / 1000}s... (${retries} left)`)
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
    newBid: number,
  ): Promise<{ success: boolean; message?: string }> {
    const client = this.buildClient(accessLicense, secretKey, customerId)
    return this.callWithRetry(async () => {
      const res = await client.put(`/ncc/keywords/${naverKeywordId}`, {
        nccKeywordId: naverKeywordId,
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
}
