import { NotFoundException } from '@nestjs/common'
import { BiddingRulesService } from '../bidding-rules.service'
import { BiddingState } from '@autobid/shared'

// CryptoJS 모킹 — 복호화 결과를 고정값으로 반환
jest.mock('crypto-js', () => ({
  AES: {
    decrypt: jest.fn().mockReturnValue({ toString: jest.fn().mockReturnValue('mock-api-key') }),
  },
  enc: { Utf8: {} },
}))

// ─── 픽스처 ─────────────────────────────────────────────────────────────────

const mockKeyword = {
  id: 'kw-1',
  keywordText: '구리인력',
  naverKeywordId: 'nkw-001',
  currentBid: 200,
  adGroup: {
    campaign: {
      adAccount: {
        id: 'acc-1',
        naverCustomerId: 'cust-001',
        accessLicenseEncrypted: 'enc-lic',
        secretKeyEncrypted: 'enc-sec',
      },
    },
  },
}

const mockCreatedRule = {
  id: 'rule-1',
  keywordId: 'kw-1',
  targetRank: 3,
  rankUpperBound: 3,
  rankLowerBound: 4,
  minBid: 100,
  maxBid: 3000,
  baseStep: 100,
  device: 'MOBILE',
  cooldownMinutes: 5,
  isActive: true,
}

const BASE_DTO = {
  keywordId: 'kw-1',
  targetRank: 3,
  minBid: 100,
  baseStep: 100,
  device: 'MOBILE',
}

// ─── 설정 ────────────────────────────────────────────────────────────────────

function buildService(overrides: { estimatedBid?: number | null; estimateError?: Error } = {}) {
  const mockPrisma = {
    biddingRule: {
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue(mockCreatedRule),
      findUnique: jest.fn().mockResolvedValue(mockCreatedRule),
      update: jest.fn().mockResolvedValue(mockCreatedRule),
      delete: jest.fn().mockResolvedValue({}),
    },
    biddingState: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    keyword: {
      findUnique: jest.fn().mockResolvedValue(mockKeyword),
    },
  }

  const mockNaverApi = {
    estimateBidForRank: overrides.estimateError
      ? jest.fn().mockRejectedValue(overrides.estimateError)
      : jest.fn().mockResolvedValue('estimatedBid' in overrides ? overrides.estimatedBid : 2000),
  }

  process.env.ENCRYPT_SECRET = 'test-secret'
  const mockQueue = { add: jest.fn().mockResolvedValue({}) }
  const service = new BiddingRulesService(mockPrisma as any, mockNaverApi as any, mockQueue as any)

  return { service, mockPrisma, mockNaverApi, mockQueue }
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('BiddingRulesService.create()', () => {
  describe('maxBid 계산 — 네이버 API 기반', () => {
    it('API 성공: 평균입찰가 × 1.5 → maxBid', async () => {
      const { service, mockPrisma } = buildService({ estimatedBid: 2000 })

      await service.create(BASE_DTO as any)

      // 2000 × 1.5 = 3000 → ceil(3000/10)*10 = 3000
      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ maxBid: 3000 }) }),
      )
    })

    it('API 성공: 소수점 절상 처리 (bid=2100 → maxBid=3150)', async () => {
      const { service, mockPrisma } = buildService({ estimatedBid: 2100 })

      await service.create(BASE_DTO as any)

      // 2100 × 1.5 = 3150
      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ maxBid: 3150 }) }),
      )
    })

    it('API 실패: currentBid × 5 폴백 사용 (200 → 1000)', async () => {
      const { service, mockPrisma } = buildService({ estimateError: new Error('Network Error') })

      await service.create(BASE_DTO as any)

      // fallback: ceil(200 × 5 / 10) × 10 = 1000
      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ maxBid: 1000 }) }),
      )
    })

    it('API가 0 또는 null을 반환하면 폴백 사용', async () => {
      const { service, mockPrisma } = buildService({ estimatedBid: null })

      await service.create(BASE_DTO as any)

      // null → 폴백: ceil(200 × 5 / 10) × 10 = 1000
      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ maxBid: 1000 }) }),
      )
    })

    it('estimate가 현재가 이하(최저가 70원 등)면 무시하고 폴백 사용', async () => {
      const { service, mockPrisma } = buildService({ estimatedBid: 70 })

      await service.create(BASE_DTO as any)

      // 70 <= currentBid(200) → estimate 무시, 폴백 ceil(200 × 5 / 10) × 10 = 1000
      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ maxBid: 1000 }) }),
      )
    })

    it('dto.maxBid 직접 지정 시 API 호출 생략', async () => {
      const { service, mockPrisma, mockNaverApi } = buildService()

      await service.create({ ...BASE_DTO, maxBid: 9000 } as any)

      expect(mockNaverApi.estimateBidForRank).not.toHaveBeenCalled()
      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ maxBid: 9000 }) }),
      )
    })
  })

  describe('기존 규칙 관리', () => {
    it('기존 활성 규칙을 모두 비활성화한다', async () => {
      const { service, mockPrisma } = buildService()

      await service.create(BASE_DTO as any)

      expect(mockPrisma.biddingRule.updateMany).toHaveBeenCalledWith({
        where: { keywordId: 'kw-1', isActive: true },
        data: { isActive: false },
      })
    })

    it('BiddingState.SEARCHING으로 초기 상태를 생성한다', async () => {
      const { service, mockPrisma } = buildService()

      await service.create(BASE_DTO as any)

      expect(mockPrisma.biddingState.create).toHaveBeenCalledWith({
        data: { biddingRuleId: 'rule-1', state: BiddingState.SEARCHING },
      })
    })
  })

  describe('기본값 처리', () => {
    it('rankUpperBound 미입력 → targetRank로 기본값', async () => {
      const { service, mockPrisma } = buildService()

      await service.create(BASE_DTO as any)

      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rankUpperBound: 3, rankLowerBound: 4 }),
        }),
      )
    })

    it('rankUpperBound 직접 지정 시 해당 값 사용', async () => {
      const { service, mockPrisma } = buildService()

      await service.create({ ...BASE_DTO, rankUpperBound: 1, rankLowerBound: 5 } as any)

      expect(mockPrisma.biddingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rankUpperBound: 1, rankLowerBound: 5 }),
        }),
      )
    })
  })

  describe('에러 처리', () => {
    it('키워드가 존재하지 않으면 NotFoundException', async () => {
      const { service, mockPrisma } = buildService()
      mockPrisma.keyword.findUnique.mockResolvedValue(null)

      await expect(service.create(BASE_DTO as any)).rejects.toThrow(NotFoundException)
    })
  })
})

describe('BiddingRulesService.toggle()', () => {
  it('isActive 값을 업데이트한다', async () => {
    const { service, mockPrisma } = buildService()

    await service.toggle('rule-1', false)

    expect(mockPrisma.biddingRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { isActive: false },
    })
  })

  it('규칙이 없으면 NotFoundException', async () => {
    const { service, mockPrisma } = buildService()
    mockPrisma.biddingRule.findUnique.mockResolvedValue(null)

    await expect(service.toggle('rule-1', true)).rejects.toThrow(NotFoundException)
  })
})

describe('BiddingRulesService.remove()', () => {
  it('상태 레코드 먼저 삭제 후 규칙 삭제', async () => {
    const { service, mockPrisma } = buildService()

    await service.remove('rule-1')

    // 순서 보장: biddingState 먼저
    const stateDelete = mockPrisma.biddingState.deleteMany.mock.invocationCallOrder[0]
    const ruleDelete = mockPrisma.biddingRule.delete.mock.invocationCallOrder[0]
    expect(stateDelete).toBeLessThan(ruleDelete)
  })
})
