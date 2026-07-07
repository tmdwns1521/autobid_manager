'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { clsx } from 'clsx'
import { adAccountsApi, keywordsApi, biddingRulesApi } from '@/lib/api'

function relativeTime(date: string | Date): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  return `${Math.floor(diff / 3600)}시간 전`
}

const STATE_LABELS: Record<string, { label: string; className: string }> = {
  SEARCHING:         { label: '탐색중',     className: 'bg-yellow-100 text-yellow-700' },
  TARGET_REACHED:    { label: '목표달성',   className: 'bg-green-100 text-green-700' },
  MIN_CPC_TESTING:   { label: '최저가탐색', className: 'bg-blue-100 text-blue-700' },
  COOLDOWN:          { label: '반영대기',   className: 'bg-gray-100 text-gray-500' },
  MAX_BID_REACHED:   { label: '목표미달',   className: 'bg-red-100 text-red-600' },
  RANK_CHECK_FAILED: { label: '조회실패',   className: 'bg-orange-100 text-orange-600' },
  PAUSED:            { label: '일시정지',   className: 'bg-gray-100 text-gray-400' },
}

const CAMPAIGN_TYPES = [
  { tp: 'WEB_SITE',     label: '파워링크' },
  { tp: 'SHOPPING',     label: '쇼핑검색' },
  { tp: 'PLACE',        label: '플레이스' },
  { tp: 'BRAND_SEARCH', label: '브랜드검색' },
  { tp: 'POWER_CONTENT',label: '파워컨텐츠' },
] as const

const DEFAULT_RULE = {
  targetRank: 3, rankUpperBound: 2, rankLowerBound: 3,
  minBid: 100, maxBid: 0, baseStep: 100,
  device: 'MOBILE',
  siteUrl: '',
}

type SortDir = 'asc' | 'desc'
type Tab = 'all' | 'bidding'

export default function KeywordsPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [campaignTp, setCampaignTp] = useState('WEB_SITE')
  const [adAccounts, setAdAccounts] = useState<any[]>([])
  const [adAccountId, setAdAccountId] = useState('')
  const [campaignTree, setCampaignTree] = useState<any[]>([])
  const [openCampaigns, setOpenCampaigns] = useState<Record<string, boolean>>({})
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null)
  const [keywords, setKeywords] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [sortBy, setSortBy] = useState('keywordText')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [loading, setLoading] = useState(false)

  // 단일 설정 모달
  const [settingKeyword, setSettingKeyword] = useState<any | null>(null)
  // 일괄 설정 모달
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  const [ruleForm, setRuleForm] = useState(DEFAULT_RULE)
  const [saving, setSaving] = useState(false)
  const [detectingUrl, setDetectingUrl] = useState(false)
  const [triggeringId, setTriggeringId] = useState<string | null>(null)

  // 수동 입찰가 변경 모달
  const [bidModal, setBidModal] = useState<{ rule: any; keyword: any } | null>(null)
  const [manualBidAmt, setManualBidAmt] = useState('')
  const [manualBidSaving, setManualBidSaving] = useState(false)

  // 그룹 maxBid 일괄 모달
  const [groupMaxBidModal, setGroupMaxBidModal] = useState(false)
  const [groupMaxBidAmt, setGroupMaxBidAmt] = useState('')
  const [groupMaxBidSaving, setGroupMaxBidSaving] = useState(false)

  // 선택된 키워드 IDs
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // 변경된 행 하이라이트 (key = keywordId, value = 애니메이션 트리거용 카운터)
  const [rowFlash, setRowFlash] = useState<Map<string, number>>(new Map())
  const prevDataRef = useRef<Map<string, any>>(new Map())

  useEffect(() => { adAccountsApi.list().then(setAdAccounts) }, [])

  useEffect(() => {
    keywordsApi.tree(adAccountId || undefined, campaignTp).then(data => {
      setCampaignTree(data)
      setOpenCampaigns({})
      setSelectedGroup(null)
    })
  }, [adAccountId, campaignTp])

  const fetchParams = useCallback(() => ({
    adAccountId: adAccountId || undefined,
    adGroupId: selectedGroup?.id || undefined,
    state: stateFilter || undefined,
    search: search || undefined,
    page,
    sortBy,
    sortDir,
    biddingOnly: tab === 'bidding' ? true : undefined,
  }), [adAccountId, selectedGroup, stateFilter, search, page, sortBy, sortDir, tab])

  const applyFreshData = useCallback((data: any[], total: number, totalPages: number, isInitial = false) => {
    if (isInitial) {
      // 최초 로드: 전체 교체 + 선택 초기화
      setKeywords(data)
      setSelected(new Set())
    } else {
      // 자동 갱신: 행 순서 유지, 데이터만 업데이트 (정렬 점프 방지)
      const newMap = new Map(data.map((k: any) => [k.id, k]))

      // 변경된 행 감지 (bid, 상태, 순위 중 하나라도 바뀌면)
      const changed: Array<[string, number]> = []
      data.forEach((kw: any) => {
        const prev = prevDataRef.current.get(kw.id)
        if (prev && (
          prev.currentBid !== kw.currentBid ||
          prev.biddingState?.state !== kw.biddingState?.state ||
          prev.lastRankCheck?.rank !== kw.lastRankCheck?.rank
        )) {
          changed.push([kw.id, Date.now()])
        }
      })

      setKeywords(prev => {
        // 기존 행은 순서 유지하며 데이터만 교체, 사라진 행은 제거
        const updated = prev
          .map((k: any) => newMap.get(k.id) ?? null)
          .filter(Boolean) as any[]
        // 새로 추가된 행은 끝에 붙임
        const existingIds = new Set(prev.map((k: any) => k.id))
        const newRows = data.filter((k: any) => !existingIds.has(k.id))
        return [...updated, ...newRows]
      })

      // 체크된 항목 중 현재 페이지에 없는 것만 제거
      setSelected(prev => {
        const valid = new Set([...prev].filter(id => newMap.has(id)))
        return valid.size === prev.size ? prev : valid
      })

      // 변경된 행 하이라이트
      if (changed.length > 0) {
        setRowFlash(prev => {
          const next = new Map(prev)
          changed.forEach(([id, ts]) => next.set(id, ts))
          return next
        })
        // 2초 후 하이라이트 제거
        const ids = changed.map(([id]) => id)
        setTimeout(() => {
          setRowFlash(prev => {
            const next = new Map(prev)
            ids.forEach(id => next.delete(id))
            return next
          })
        }, 2000)
      }
    }

    prevDataRef.current = new Map(data.map((k: any) => [k.id, k]))
    setTotal(total)
    setTotalPages(totalPages)
    setLastUpdated(new Date())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await keywordsApi.list(fetchParams())
      applyFreshData(res.data, res.total, res.totalPages, true)
    } finally {
      setLoading(false)
    }
  }, [fetchParams, applyFreshData])

  useEffect(() => { load() }, [load])

  // 10초마다 조용히 자동 갱신 (모달 열려있을 때는 중지)
  const hasModal = !!settingKeyword || bulkModal || !!bidModal || groupMaxBidModal
  useEffect(() => {
    if (hasModal) return
    const id = setInterval(async () => {
      try {
        const res = await keywordsApi.list(fetchParams())
        applyFreshData(res.data, res.total, res.totalPages, false)
      } catch {}
    }, 10_000)
    return () => clearInterval(id)
  }, [hasModal, fetchParams, applyFreshData])

  // ─── 핸들러 ──────────────────────────────────────────────────────────────

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
    setPage(1)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === keywords.length) setSelected(new Set())
    else setSelected(new Set(keywords.map(k => k.id)))
  }

  const handleSetRule = (kw: any) => {
    setSettingKeyword(kw)
    const initialForm = kw.biddingRule ? {
      targetRank: kw.biddingRule.targetRank,
      rankUpperBound: kw.biddingRule.rankUpperBound,
      rankLowerBound: kw.biddingRule.rankLowerBound,
      minBid: kw.biddingRule.minBid,
      maxBid: kw.biddingRule.maxBid ?? 0,
      baseStep: kw.biddingRule.baseStep,
      device: kw.biddingRule.device,
      siteUrl: kw.biddingRule.siteUrl ?? '',
    } : { ...DEFAULT_RULE, minBid: Math.max(100, kw.currentBid) }
    setRuleForm(initialForm)

    if (!initialForm.siteUrl) {
      setDetectingUrl(true)
      biddingRulesApi.detectSiteUrl(kw.id, initialForm.device)
        .then(({ siteUrl }) => {
          if (siteUrl) setRuleForm(f => ({ ...f, siteUrl }))
        })
        .catch(() => {})
        .finally(() => setDetectingUrl(false))
    }
  }

  const handleOpenBulk = () => {
    setRuleForm(DEFAULT_RULE)
    setBulkModal(true)
  }

  const handleSaveRule = async () => {
    if (!settingKeyword) return
    setSaving(true)
    try {
      const { siteUrl, maxBid, ...rest } = ruleForm
      await biddingRulesApi.create({
        keywordId: settingKeyword.id,
        ...rest,
        ...(siteUrl ? { siteUrl } : {}),
        ...(maxBid > 0 ? { maxBid } : {}),
      })
      setSettingKeyword(null)
      await load()
    } catch (e: any) {
      alert(e.response?.data?.message || '저장 오류')
    } finally {
      setSaving(false)
    }
  }

  const handleManualBid = async () => {
    if (!bidModal || !manualBidAmt) return
    const amt = parseInt(manualBidAmt)
    if (isNaN(amt) || amt < 70) return alert('입찰가는 70원 이상이어야 합니다')
    setManualBidSaving(true)
    try {
      await biddingRulesApi.manualBid(bidModal.rule.id, amt)
      setBidModal(null)
      setManualBidAmt('')
      await load()
    } catch (e: any) {
      alert(e.response?.data?.message || '입찰가 변경 실패')
    } finally {
      setManualBidSaving(false)
    }
  }

  const handleGroupMaxBid = async () => {
    if (!selectedGroup || !groupMaxBidAmt) return
    const amt = parseInt(groupMaxBidAmt)
    if (isNaN(amt) || amt < 70) return alert('입찰가는 70원 이상이어야 합니다')
    setGroupMaxBidSaving(true)
    try {
      await biddingRulesApi.setGroupMaxBid(selectedGroup.id, amt)
      setGroupMaxBidModal(false)
      setGroupMaxBidAmt('')
      await load()
    } catch (e: any) {
      alert(e.response?.data?.message || 'maxBid 설정 실패')
    } finally {
      setGroupMaxBidSaving(false)
    }
  }

  const handleBulkSave = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBulkSaving(true)
    setBulkProgress({ done: 0, total: ids.length })
    let done = 0
    const errors: string[] = []
    for (const keywordId of ids) {
      try {
        await biddingRulesApi.create({ keywordId, ...ruleForm })
        done++
        setBulkProgress({ done, total: ids.length })
      } catch (e: any) {
        errors.push(keywordId)
      }
    }
    setBulkSaving(false)
    setBulkProgress(null)
    setBulkModal(false)
    setSelected(new Set())
    await load()
    if (errors.length > 0) alert(`${errors.length}개 키워드 저장 실패`)
  }

  const handleToggle = async (kw: any) => {
    if (!kw.biddingRule) return
    await biddingRulesApi.toggle(kw.biddingRule.id, !kw.biddingRule.isActive)
    await load()
  }

  const SortIcon = ({ col }: { col: string }) => (
    <span className={clsx('ml-1 text-xs', sortBy === col ? 'text-blue-500' : 'text-gray-300')}>
      {sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  const STATE_FILTERS = ['', 'SEARCHING', 'TARGET_REACHED', 'MIN_CPC_TESTING', 'MAX_BID_REACHED']
  const STATE_FILTER_LABELS: Record<string, string> = {
    '': '전체', SEARCHING: '탐색중', TARGET_REACHED: '목표달성',
    MIN_CPC_TESTING: '최저가탐색', MAX_BID_REACHED: '목표미달',
  }

  const selectedCount = selected.size
  const allChecked = keywords.length > 0 && selected.size === keywords.length
  const someChecked = selected.size > 0 && selected.size < keywords.length

  // 공통 설정 모달 UI (단일 / 일괄 공용)
  const RuleFormUI = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">목표순위</label>
          <input type="number" min={1} max={15} value={ruleForm.targetRank}
            onChange={e => setRuleForm(f => ({ ...f, targetRank: +e.target.value, rankUpperBound: Math.max(1, +e.target.value - 1), rankLowerBound: +e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">허용 상단</label>
          <input type="number" min={1} value={ruleForm.rankUpperBound}
            onChange={e => setRuleForm(f => ({ ...f, rankUpperBound: +e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">허용 하단</label>
          <input type="number" min={1} value={ruleForm.rankLowerBound}
            onChange={e => setRuleForm(f => ({ ...f, rankLowerBound: +e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
        {ruleForm.rankUpperBound}위 ~ {ruleForm.rankLowerBound}위 범위 유지 → 달성 후 최저가 탐색
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">최소 입찰가 (원)</label>
          <input type="number" min={10} step={10} value={ruleForm.minBid}
            onChange={e => setRuleForm(f => ({ ...f, minBid: +e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">최대 입찰가 (원)</label>
          <input type="number" min={0} step={100} value={ruleForm.maxBid ?? 0}
            onChange={e => setRuleForm(f => ({ ...f, maxBid: +e.target.value }))}
            placeholder="0 = 자동 계산"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
        최대 입찰가를 0으로 두면 네이버 예상 입찰가 API로 자동 계산합니다. 직접 입력하면 그 값을 상한으로 사용합니다.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">가감액 (원)</label>
          <input type="number" min={10} step={10} value={ruleForm.baseStep}
            onChange={e => setRuleForm(f => ({ ...f, baseStep: +e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">디바이스</label>
          <select value={ruleForm.device} onChange={e => {
            const device = e.target.value
            setRuleForm(f => ({ ...f, device, siteUrl: '' }))
            if (settingKeyword) {
              setDetectingUrl(true)
              biddingRulesApi.detectSiteUrl(settingKeyword.id, device)
                .then(({ siteUrl }) => { if (siteUrl) setRuleForm(f => ({ ...f, siteUrl })) })
                .catch(() => {})
                .finally(() => setDetectingUrl(false))
            }
          }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="MOBILE">모바일</option>
            <option value="PC">PC</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
          내 사이트 URL
          {detectingUrl && <span className="text-xs text-blue-500 font-normal animate-pulse">감지 중...</span>}
        </label>
        <input type="text"
          placeholder={detectingUrl ? '광고 소재에서 자동 감지 중...' : '예: job25bundang.co.kr'}
          value={ruleForm.siteUrl}
          onChange={e => setRuleForm(f => ({ ...f, siteUrl: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <p className="text-xs text-gray-400 mt-1">광고 소재의 랜딩 URL을 자동 감지합니다 · 수정 가능</p>
      </div>
    </div>
  )

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      <style>{`
        @keyframes rowFlash {
          0%, 50% { background-color: #fef9c3; }
          100%     { background-color: transparent; }
        }
        .row-flash { animation: rowFlash 2s ease-out forwards; }
      `}</style>

      {/* ─── 왼쪽: 캠페인 트리 ───────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 border-b border-gray-100">
          {/* 광고 유형 탭 */}
          <div className="px-2 pt-3 pb-2 flex flex-wrap gap-1">
            {CAMPAIGN_TYPES.map(ct => (
              <button
                key={ct.tp}
                onClick={() => { setCampaignTp(ct.tp); setSelectedGroup(null); setPage(1) }}
                className={clsx(
                  'px-2 py-1 text-xs font-medium rounded-md transition',
                  campaignTp === ct.tp
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                )}
              >
                {ct.label}
              </button>
            ))}
          </div>
          <div className="px-3 pb-3">
            <select
              value={adAccountId}
              onChange={e => { setAdAccountId(e.target.value); setPage(1) }}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="">전체 계정</option>
              {adAccounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </div>
        </div>
        <div className="py-1">
          <button
            onClick={() => { setSelectedGroup(null); setPage(1) }}
            className={clsx('w-full text-left px-4 py-2 text-xs font-medium transition',
              !selectedGroup ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50')}
          >
            전체 키워드 ({total.toLocaleString()})
          </button>
          {campaignTree.map(campaign => (
            <div key={campaign.id}>
              <button
                onClick={() => setOpenCampaigns(p => ({ ...p, [campaign.id]: !p[campaign.id] }))}
                className="w-full text-left px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
              >
                <span className="truncate">{campaign.name}</span>
                <span className="text-gray-400 ml-1 flex-shrink-0">
                  {openCampaigns[campaign.id] ? '▾' : '▸'}
                </span>
              </button>
              {openCampaigns[campaign.id] && campaign.adGroups.map((g: any) => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGroup({ id: g.id, name: g.name }); setPage(1) }}
                  className={clsx(
                    'w-full text-left pl-7 pr-4 py-1.5 text-xs transition flex items-center justify-between',
                    selectedGroup?.id === g.id ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50',
                  )}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="text-xs text-gray-400 ml-1 flex-shrink-0">{g.keywordCount}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ─── 오른쪽: 키워드 테이블 ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 space-y-3">

        {/* 탭 + 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-3">
          <div className="flex gap-1 border-b border-gray-100 pb-3">
            {(['all', 'bidding'] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setPage(1) }}
                className={clsx('px-4 py-1.5 text-sm font-medium rounded-lg transition',
                  tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
                {t === 'all' ? '전체 키워드' : '자동입찰 설정됨'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="text" placeholder="키워드 검색" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {selectedGroup && (
              <button
                onClick={() => { setGroupMaxBidAmt(''); setGroupMaxBidModal(true) }}
                className="px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-100 transition"
              >
                그룹 maxBid 설정
              </button>
            )}
            {tab === 'bidding' && (
              <div className="flex gap-1.5">
                {STATE_FILTERS.map(s => (
                  <button key={s} onClick={() => { setStateFilter(s); setPage(1) }}
                    className={clsx('px-2.5 py-1 text-xs font-medium rounded-full border transition',
                      stateFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400')}>
                    {STATE_FILTER_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
              {lastUpdated && (
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 기준
                </span>
              )}
              {total.toLocaleString()}개
            </div>
          </div>
        </div>

        {/* 선택 시 나타나는 액션 바 */}
        {selectedCount > 0 && (
          <div className="bg-blue-600 text-white rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-lg">
            <span className="text-sm font-medium">{selectedCount}개 선택됨</span>
            <div className="flex gap-2 ml-auto">
              <button onClick={() => setSelected(new Set())}
                className="px-3 py-1.5 text-xs bg-white/20 hover:bg-white/30 rounded-lg transition">
                선택 해제
              </button>
              <button onClick={handleOpenBulk}
                className="px-3 py-1.5 text-xs bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition">
                일괄 자동입찰 설정
              </button>
            </div>
          </div>
        )}

        {/* 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="py-3 px-3 w-8">
                  <input type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                </th>
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 cursor-pointer select-none"
                  onClick={() => handleSort('keywordText')}>
                  키워드 <SortIcon col="keywordText" />
                </th>
                {!selectedGroup && (
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 cursor-pointer select-none"
                    onClick={() => handleSort('adGroupName')}>
                    그룹 <SortIcon col="adGroupName" />
                  </th>
                )}
                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 cursor-pointer select-none"
                  onClick={() => handleSort('currentBid')}>
                  입찰가 <SortIcon col="currentBid" />
                </th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500">목표순위</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500">최소/최대</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500">상태</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500">현재순위</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500">자동입찰</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-16 text-center text-sm text-gray-400">불러오는 중...</td></tr>
              ) : keywords.length === 0 ? (
                <tr><td colSpan={10} className="py-16 text-center text-sm text-gray-400">키워드가 없습니다.</td></tr>
              ) : keywords.map(kw => {
                const rule = kw.biddingRule
                const stateInfo = kw.biddingState ? STATE_LABELS[kw.biddingState.state] : null
                const isSelected = selected.has(kw.id)

                const isFlashing = rowFlash.has(kw.id) && !isSelected
                return (
                  <tr key={kw.id}
                    className={clsx(
                      'border-b border-gray-50 hover:bg-gray-50 transition-colors',
                      isSelected && 'bg-blue-50 hover:bg-blue-50',
                      isFlashing && 'row-flash',
                    )}>
                    <td className="py-2.5 px-3">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(kw.id)}
                        className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                    </td>
                    <td className="py-2.5 px-3 font-medium text-gray-900">{kw.keywordText}</td>
                    {!selectedGroup && (
                      <td className="py-2.5 px-3 text-xs text-gray-400">
                        <span className="text-gray-500">{kw.campaignName}</span>
                        <span className="mx-1">/</span>
                        {kw.adGroupName}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-right font-mono text-gray-700">{kw.currentBid.toLocaleString()}원</td>
                    <td className="py-2.5 px-3 text-center text-gray-600">
                      {rule ? `${rule.targetRank}위` : <span className="text-gray-200">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-gray-400">
                      {rule ? `${rule.minBid.toLocaleString()} / ${rule.maxBid.toLocaleString()}` : <span className="text-gray-200">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {stateInfo
                        ? <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', stateInfo.className)}>{stateInfo.label}</span>
                        : <span className="text-gray-200 text-xs">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {rule ? (() => {
                        const pc = kw.lastPcRankCheck
                        const mobile = kw.lastMobileRankCheck
                        const hasAny = pc || mobile
                        const latestCheckedAt = pc && mobile
                          ? (new Date(pc.checkedAt) > new Date(mobile.checkedAt) ? pc.checkedAt : mobile.checkedAt)
                          : (pc?.checkedAt ?? mobile?.checkedAt ?? null)
                        return hasAny ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex gap-1 text-xs">
                              {pc && (
                                <span className={clsx('px-1.5 py-0.5 rounded font-medium',
                                  pc.found ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400')}>
                                  PC {pc.found && pc.rank != null ? `${pc.rank}위` : '미노출'}
                                </span>
                              )}
                              {mobile && (
                                <span className={clsx('px-1.5 py-0.5 rounded font-medium',
                                  mobile.found ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-400')}>
                                  M {mobile.found && mobile.rank != null ? `${mobile.rank}위` : '미노출'}
                                </span>
                              )}
                            </div>
                            {latestCheckedAt && (
                              <span className="text-[10px] text-gray-300">{relativeTime(latestCheckedAt)}</span>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-xs">-</span>
                      })() : <span className="text-gray-200 text-xs">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {rule ? (
                        <button onClick={() => handleToggle(kw)}
                          className={clsx('relative inline-flex h-5 w-9 rounded-full transition-colors',
                            rule.isActive ? 'bg-blue-600' : 'bg-gray-200')}>
                          <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5',
                            rule.isActive ? 'translate-x-4' : 'translate-x-1')} />
                        </button>
                      ) : <span className="text-gray-200 text-xs">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {rule && (
                          <>
                            <button
                              onClick={() => {
                                setBidModal({ rule, keyword: kw })
                                setManualBidAmt(String(kw.currentBid))
                              }}
                              title="입찰가 수동 변경"
                              className="px-2 py-1 text-xs bg-orange-50 text-orange-600 rounded-md hover:bg-orange-100 font-medium"
                            >
                              ₩ 변경
                            </button>
                            <button
                              onClick={async () => {
                                setTriggeringId(rule.id)
                                try {
                                  await biddingRulesApi.trigger(rule.id)
                                } catch {}
                                setTimeout(() => setTriggeringId(null), 2000)
                              }}
                              disabled={triggeringId === rule.id}
                              title="지금 즉시 입찰 실행"
                              className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded-md hover:bg-green-100 disabled:opacity-40 font-medium"
                            >
                              {triggeringId === rule.id ? '실행중' : '▶ 실행'}
                            </button>
                          </>
                        )}
                        <button onClick={() => handleSetRule(kw)}
                          className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100">
                          {rule ? '수정' : '설정'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between sticky bottom-0 bg-white">
              <p className="text-xs text-gray-400">{total.toLocaleString()}개 중 {((page-1)*50)+1}~{Math.min(page*50, total)}개</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page===1}
                  className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">«</button>
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                  className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">이전</button>
                <span className="px-3 py-1 text-xs text-gray-600 border border-blue-200 rounded bg-blue-50">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                  className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">다음</button>
                <button onClick={() => setPage(totalPages)} disabled={page===totalPages}
                  className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── 단일 설정 모달 ──────────────────────────────────────────────── */}
      {settingKeyword && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">자동입찰 설정</h2>
                <p className="text-sm text-blue-600 mt-0.5 font-medium">{settingKeyword.keywordText}</p>
                <p className="text-xs text-gray-400 mt-0.5">현재 입찰가: {settingKeyword.currentBid.toLocaleString()}원</p>
              </div>
              <button onClick={() => setSettingKeyword(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <RuleFormUI />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setSettingKeyword(null)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleSaveRule} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '입찰가 자동 계산 중...' : '저장 및 시작'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 수동 입찰가 변경 모달 ──────────────────────────────────────── */}
      {bidModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">입찰가 수동 변경</h2>
                <p className="text-sm text-blue-600 mt-0.5 font-medium">{bidModal.keyword.keywordText}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  현재: {bidModal.keyword.currentBid.toLocaleString()}원
                  {' · '}maxBid: {bidModal.rule.maxBid.toLocaleString()}원
                </p>
              </div>
              <button onClick={() => setBidModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">새 입찰가 (원)</label>
                <input
                  type="number" min={70} step={10}
                  value={manualBidAmt}
                  onChange={e => setManualBidAmt(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                네이버 API로 즉시 변경됩니다. 이후 자동입찰이 이 값을 기준으로 조정합니다.
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setBidModal(null)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleManualBid} disabled={manualBidSaving}
                className="flex-1 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
                {manualBidSaving ? '변경 중...' : '입찰가 변경'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 그룹 maxBid 일괄 설정 모달 ─────────────────────────────────── */}
      {groupMaxBidModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">그룹 최대 입찰가 설정</h2>
                <p className="text-sm text-orange-600 mt-0.5 font-medium">{selectedGroup.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">그룹 내 모든 키워드의 maxBid를 일괄 변경합니다</p>
              </div>
              <button onClick={() => setGroupMaxBidModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">최대 입찰가 (원)</label>
                <input
                  type="number" min={70} step={100}
                  value={groupMaxBidAmt}
                  onChange={e => setGroupMaxBidAmt(e.target.value)}
                  autoFocus
                  placeholder="예: 5000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                이 그룹의 모든 자동입찰 규칙에 적용됩니다. 이 금액 이상으로는 절대 올라가지 않습니다.
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setGroupMaxBidModal(false)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleGroupMaxBid} disabled={groupMaxBidSaving}
                className="flex-1 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
                {groupMaxBidSaving ? '저장 중...' : '일괄 적용'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 일괄 설정 모달 ──────────────────────────────────────────────── */}
      {bulkModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">일괄 자동입찰 설정</h2>
                <p className="text-sm text-blue-600 mt-0.5 font-medium">선택된 키워드 {selectedCount}개에 동일 규칙 적용</p>
                <p className="text-xs text-gray-400 mt-0.5">기존 규칙이 있는 키워드는 덮어씁니다</p>
              </div>
              <button onClick={() => !bulkSaving && setBulkModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <RuleFormUI />

            {/* 진행 바 */}
            {bulkProgress && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>저장 중...</span>
                  <span>{bulkProgress.done} / {bulkProgress.total}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setBulkModal(false)} disabled={bulkSaving}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
                취소
              </button>
              <button onClick={handleBulkSave} disabled={bulkSaving}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {bulkSaving ? `저장 중... (${bulkProgress?.done ?? 0}/${selectedCount})` : `${selectedCount}개 일괄 저장`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
