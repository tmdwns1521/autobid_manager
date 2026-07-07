// ts-jest 환경에서는 jest.mock 팩토리에서 외부 변수를 참조할 수 없음.
// axios.create를 jest.fn()으로 만들어두고, 각 테스트에서 beforeEach로 반환값을 설정한다.
jest.mock('axios', () => {
  const m = { create: jest.fn() }
  return { ...m, default: m, __esModule: true }
})

import axios from 'axios'
import { NaverApiClient } from '../naver-api.client'

const axiosError = (status: number, data: object = {}) => ({
  response: { status, data },
  message: `Request failed with status code ${status}`,
})

describe('NaverApiClient', () => {
  let client: NaverApiClient
  let mockInstance: {
    post: jest.Mock
    get: jest.Mock
    put: jest.Mock
    interceptors: { request: { use: jest.Mock } }
  }

  beforeEach(() => {
    mockInstance = {
      interceptors: { request: { use: jest.fn() } },
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
    }
    ;(axios.create as jest.Mock).mockReturnValue(mockInstance)
    client = new NaverApiClient()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ─── estimateBidForRank ───────────────────────────────────────────────────

  describe('estimateBidForRank()', () => {
    it('성공: estimate[0].bid를 반환한다', async () => {
      mockInstance.post.mockResolvedValue({ data: { estimate: [{ bid: 3260 }] } })

      const result = await client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE')

      expect(result).toBe(3260)
    })

    it('올바른 엔드포인트와 파라미터로 호출한다', async () => {
      mockInstance.post.mockResolvedValue({ data: { estimate: [{ bid: 1000 }] } })

      await client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE')

      expect(mockInstance.post).toHaveBeenCalledWith('/estimate/average-position-bid/id', {
        device: 'MOBILE',
        items: [{ key: 'nkw-001', position: 3 }],
      })
    })

    it('estimate 배열이 없으면 null 반환', async () => {
      mockInstance.post.mockResolvedValue({ data: {} })

      const result = await client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE')

      expect(result).toBeNull()
    })

    it('PC 디바이스도 올바르게 전달한다', async () => {
      mockInstance.post.mockResolvedValue({ data: { estimate: [{ bid: 5000 }] } })

      await client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 1, 'PC')

      expect(mockInstance.post).toHaveBeenCalledWith('/estimate/average-position-bid/id', {
        device: 'PC',
        items: [{ key: 'nkw-001', position: 1 }],
      })
    })
  })

  // ─── 재시도 로직 ──────────────────────────────────────────────────────────

  describe('callWithRetry — 재시도 동작', () => {
    it('4xx 에러는 즉시 throw (재시도 없음)', async () => {
      mockInstance.post.mockRejectedValue(axiosError(400))

      await expect(
        client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE'),
      ).rejects.toMatchObject({ response: { status: 400 } })

      expect(mockInstance.post).toHaveBeenCalledTimes(1)
    })

    it('401, 403, 404도 재시도 없이 즉시 throw', async () => {
      for (const status of [401, 403, 404]) {
        mockInstance.post.mockRejectedValue(axiosError(status))

        await expect(
          client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE'),
        ).rejects.toMatchObject({ response: { status } })

        expect(mockInstance.post).toHaveBeenCalledTimes(1)
        mockInstance.post.mockClear()
      }
    })

    it('5xx 에러는 최대 2회 재시도 후 throw (총 3회 호출)', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })
      mockInstance.post.mockRejectedValue(axiosError(500))

      await expect(
        client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE'),
      ).rejects.toMatchObject({ response: { status: 500 } })

      expect(mockInstance.post).toHaveBeenCalledTimes(3)
      jest.restoreAllMocks()
    })

    it('재시도 중 성공하면 결과를 반환한다', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })
      mockInstance.post
        .mockRejectedValueOnce(axiosError(503))
        .mockResolvedValueOnce({ data: { estimate: [{ bid: 2500 }] } })

      const result = await client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE')

      expect(result).toBe(2500)
      expect(mockInstance.post).toHaveBeenCalledTimes(2)
      jest.restoreAllMocks()
    })

    it('429 Too Many Requests는 재시도 대상이다', async () => {
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })
      mockInstance.post.mockRejectedValue(axiosError(429))

      await expect(
        client.estimateBidForRank('lic', 'sec', 'cust', 'nkw-001', 3, 'MOBILE'),
      ).rejects.toMatchObject({ response: { status: 429 } })

      expect(mockInstance.post).toHaveBeenCalledTimes(3)
      jest.restoreAllMocks()
    })
  })

  // ─── updateKeywordBid ─────────────────────────────────────────────────────

  describe('updateKeywordBid()', () => {
    it('fields 파라미터를 포함한 올바른 엔드포인트로 호출한다', async () => {
      mockInstance.put.mockResolvedValue({ data: { nccKeywordId: 'nkw-001', bidAmt: 1500 } })

      await client.updateKeywordBid('lic', 'sec', 'cust', 'nkw-001', 'grp-001', 1500)

      expect(mockInstance.put).toHaveBeenCalledWith(
        '/ncc/keywords/nkw-001?fields=bidAmt,useGroupBidAmt',
        { nccKeywordId: 'nkw-001', nccAdgroupId: 'grp-001', bidAmt: 1500, useGroupBidAmt: false },
      )
    })

    it('성공 시 success: true를 반환한다', async () => {
      mockInstance.put.mockResolvedValue({ data: {} })

      const result = await client.updateKeywordBid('lic', 'sec', 'cust', 'nkw-001', 'grp-001', 1500)

      expect(result.success).toBe(true)
    })
  })
})
