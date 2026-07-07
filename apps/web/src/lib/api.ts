import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
})

export default api

// ─── Ad Accounts ─────────────────────────────────────────────────────────────

export const adAccountsApi = {
  list: () => api.get('/ad-accounts').then(r => r.data),
  create: (data: { accountName: string; naverCustomerId: string; accessLicense: string; secretKey: string }) =>
    api.post('/ad-accounts', data).then(r => r.data),
  sync: (id: string) => api.post(`/ad-accounts/${id}/sync`).then(r => r.data),
  remove: (id: string) => api.delete(`/ad-accounts/${id}`).then(r => r.data),
}

// ─── Keywords ────────────────────────────────────────────────────────────────

export const keywordsApi = {
  list: (params?: {
    adAccountId?: string
    adGroupId?: string
    state?: string
    search?: string
    page?: number
    limit?: number
    sortBy?: string
    sortDir?: string
    biddingOnly?: boolean
  }) => api.get('/keywords', { params }).then(r => r.data),
  tree: (adAccountId?: string, campaignTp?: string) =>
    api.get('/keywords/tree', { params: { ...(adAccountId ? { adAccountId } : {}), ...(campaignTp ? { campaignTp } : {}) } }).then(r => r.data),
}

// ─── Bidding Rules ───────────────────────────────────────────────────────────

export const biddingRulesApi = {
  create: (data: any) => api.post('/bidding-rules', data).then(r => r.data),
  update: (id: string, data: any) => api.patch(`/bidding-rules/${id}`, data).then(r => r.data),
  toggle: (id: string, isActive: boolean) =>
    api.patch(`/bidding-rules/${id}`, { isActive }).then(r => r.data),
  detectSiteUrl: (keywordId: string, device: string) =>
    api.get('/bidding-rules/detect-site-url', { params: { keywordId, device } }).then(r => r.data as { siteUrl: string | null }),
  trigger: (id: string) => api.post(`/bidding-rules/${id}/trigger`).then(r => r.data),
  manualBid: (id: string, bidAmt: number) =>
    api.post(`/bidding-rules/${id}/set-bid`, { bidAmt }).then(r => r.data),
  setGroupMaxBid: (adGroupId: string, maxBid: number) =>
    api.post('/bidding-rules/group-max-bid', { adGroupId, maxBid }).then(r => r.data),
}

// ─── Rank ─────────────────────────────────────────────────────────────────────

export const rankApi = {
  check: (biddingRuleId: string) =>
    api.get('/rank/check', { params: { biddingRuleId } }).then(r => r.data as {
      keyword: string
      siteUrl: string
      pc: { rank: number | null; found: boolean; totalAds: number }
      mobile: { rank: number | null; found: boolean; totalAds: number }
      checkedAt: string
      error?: string
    }),
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export const logsApi = {
  list: (params?: { keywordId?: string; keywordText?: string; decision?: string; limit?: number; offset?: number }) =>
    api.get('/logs', { params }).then(r => r.data),
  rankHistory: (keywordId: string, limit = 100) =>
    api.get('/logs/rank-history', { params: { keywordId, limit } }).then(r => r.data),
  // 실제 입찰가가 바뀐 로그만
  bidChanges: (params?: { keywordId?: string; keywordText?: string; limit?: number; offset?: number }) =>
    api.get('/logs/bid-changes', { params }).then(r => r.data),
  // 실제 등수가 바뀐 로그만 (델타)
  rankChanges: (params?: { keywordId?: string; keywordText?: string; limit?: number; offset?: number }) =>
    api.get('/logs/rank-changes', { params }).then(r => r.data),
}
