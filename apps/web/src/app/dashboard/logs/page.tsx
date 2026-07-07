'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { clsx } from 'clsx'
import { logsApi } from '@/lib/api'

const DECISION_META: Record<string, { label: string; className: string; icon: string }> = {
  INCREASE:          { label: '증액',       className: 'bg-red-50 text-red-600',       icon: '↑' },
  DECREASE:          { label: '감액',       className: 'bg-blue-50 text-blue-600',     icon: '↓' },
  DECREASE_TEST:     { label: '최저가탐색', className: 'bg-blue-50 text-blue-400',     icon: '↓' },
  RESTORE_STABLE_BID:{ label: '복구',       className: 'bg-purple-50 text-purple-600', icon: '↩' },
  HOLD:              { label: '유지',       className: 'bg-gray-50 text-gray-500',     icon: '—' },
  COOLDOWN:          { label: '대기',       className: 'bg-gray-50 text-gray-400',     icon: '⏳' },
  MAX_BID_REACHED:   { label: '목표미달',   className: 'bg-orange-50 text-orange-600', icon: '⚠' },
  MIN_BID_REACHED:   { label: '최소가',     className: 'bg-indigo-50 text-indigo-600', icon: '▣' },
  RANK_CHECK_FAILED: { label: '조회실패',   className: 'bg-orange-50 text-orange-500', icon: '?' },
}

const LIMIT = 50
const REFRESH_MS = 15_000 // 자동 갱신 주기 (데이터는 5분 주기로 바뀌지만 체감 실시간을 위해 15초 폴링)

// 폴링 결과가 실제로 바뀌지 않았으면 상태를 그대로 둬서 재렌더/깜빡임/스크롤 튐을 막는다.
// 로그는 append-only라 길이 + 처음/마지막 id만 비교해도 충분.
function sameHead(a: any[], b: any[]) {
  return a.length === b.length && a[0]?.id === b[0]?.id && a[a.length - 1]?.id === b[b.length - 1]?.id
}

type TabKey = 'all' | 'bid' | 'rank'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',  label: '전체 판단 로그' },
  { key: 'bid',  label: '실제 가격변경' },
  { key: 'rank', label: '실제 등수변경' },
]

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function formatTimeShort(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

// 순위 스파크라인 (SVG)
function RankSparkline({ data }: { data: { rank: number | null }[] }) {
  const ranked = data.filter(d => d.rank != null)
  if (ranked.length < 2) return <span className="text-xs text-gray-300">데이터 부족</span>

  const ranks = ranked.map(d => d.rank as number)
  const minR = Math.min(...ranks)
  const maxR = Math.max(...ranks)
  const range = maxR - minR || 1
  const W = 200, H = 40, PAD = 4

  const points = ranked.map((d, i) => {
    const x = PAD + (i / (ranked.length - 1)) * (W - PAD * 2)
    // 순위는 낮을수록 좋음 → y축 반전
    const y = PAD + ((d.rank! - minR) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {ranked.map((d, i) => {
        const x = PAD + (i / (ranked.length - 1)) * (W - PAD * 2)
        const y = PAD + ((d.rank! - minR) / range) * (H - PAD * 2)
        return <circle key={i} cx={x} cy={y} r="2.5" fill="#3b82f6" />
      })}
    </svg>
  )
}

// 페이지네이션 (탭 공용)
function Pager({ page, totalPages, total, onPage }: {
  page: number; totalPages: number; total: number; onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
      <p className="text-xs text-gray-400">
        {total.toLocaleString()}건 중 {(page - 1) * LIMIT + 1}~{Math.min(page * LIMIT, total)}건
      </p>
      <div className="flex gap-1">
        <button onClick={() => onPage(1)} disabled={page === 1}
          className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">«</button>
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">이전</button>
        <span className="px-3 py-1 text-xs text-gray-600 border border-blue-200 rounded bg-blue-50">{page} / {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">다음</button>
        <button onClick={() => onPage(totalPages)} disabled={page === totalPages}
          className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">»</button>
      </div>
    </div>
  )
}

// ─── 실제 가격변경 탭 ──────────────────────────────────────────────────────────
function BidChangesTab() {
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await logsApi.bidChanges({ keywordText: search || undefined, limit: LIMIT, offset: (page - 1) * LIMIT })
      setRows(prev => (sameHead(prev, res.data) ? prev : res.data))
      setTotal(res.total)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [search, page])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const handleSearch = (val: string) => {
    setSearchInput(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { setSearch(val); setPage(1) }, 400)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex gap-3 items-center">
        <input
          type="text"
          placeholder="키워드 검색"
          value={searchInput}
          onChange={e => handleSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">네이버에 실제 반영된 입찰가 변경만 표시</span>
        <span className="ml-auto text-xs text-gray-400">{total.toLocaleString()}건</span>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 w-36">시간</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">키워드</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 w-24">판단</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 w-16">순위</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 w-24">변경 전</th>
            <th className="text-center py-3 px-2 text-xs font-medium text-gray-300 w-6"></th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 w-24">변경 후</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 w-20">증감</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">사유</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="py-16 text-center text-sm text-gray-400">불러오는 중...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} className="py-16 text-center text-sm text-gray-400">
              {search ? '조건에 맞는 변경이 없습니다.' : '실제 입찰가가 변경되면 기록됩니다.'}
            </td></tr>
          ) : (
            rows.map(r => {
              const meta = DECISION_META[r.decision]
              const up = r.diff > 0
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 px-4 text-xs text-gray-400 tabular-nums whitespace-nowrap">{formatTime(r.createdAt)}</td>
                  <td className="py-2.5 px-4 font-medium text-gray-900">{r.keywordText}</td>
                  <td className="py-2.5 px-4 text-center">
                    {meta ? (
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', meta.className)}>{meta.icon} {meta.label}</span>
                    ) : <span className="text-xs text-gray-400">{r.decision}</span>}
                  </td>
                  <td className="py-2.5 px-4 text-center text-gray-600 tabular-nums">
                    {r.beforeRank != null ? `${r.beforeRank}위` : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-mono text-gray-400">{r.beforeBid.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-center text-gray-300 text-xs">→</td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-mono text-gray-900 font-semibold">{r.afterBid.toLocaleString()}</td>
                  <td className={clsx('py-2.5 px-4 text-right tabular-nums font-mono text-xs', up ? 'text-red-500' : 'text-blue-500')}>
                    {up ? '+' : ''}{r.diff.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 max-w-xs truncate">{r.reason ?? '—'}</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      <Pager page={page} totalPages={totalPages} total={total} onPage={setPage} />
    </div>
  )
}

// ─── 실제 등수변경 탭 ──────────────────────────────────────────────────────────
function RankChangesTab() {
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await logsApi.rankChanges({ keywordText: search || undefined, limit: LIMIT, offset: (page - 1) * LIMIT })
      setRows(prev => (sameHead(prev, res.data) ? prev : res.data))
      setTotal(res.total)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [search, page])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const handleSearch = (val: string) => {
    setSearchInput(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { setSearch(val); setPage(1) }, 400)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex gap-3 items-center">
        <input
          type="text"
          placeholder="키워드 검색"
          value={searchInput}
          onChange={e => handleSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">직전 조회 대비 순위가 실제로 바뀐 시점만 표시</span>
        <span className="ml-auto text-xs text-gray-400">{total.toLocaleString()}건</span>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 w-36">시간</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">키워드</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 w-20">기기</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 w-20">이전</th>
            <th className="text-center py-3 px-2 text-xs font-medium text-gray-300 w-6"></th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 w-20">현재</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 w-24">변동</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="py-16 text-center text-sm text-gray-400">불러오는 중...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="py-16 text-center text-sm text-gray-400">
              {search ? '조건에 맞는 변경이 없습니다.' : '순위가 변동되면 기록됩니다.'}
            </td></tr>
          ) : (
            rows.map(r => {
              const improved = r.diff < 0 // 순위 숫자 감소 = 상승
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 px-4 text-xs text-gray-400 tabular-nums whitespace-nowrap">{formatTime(r.checkedAt)}</td>
                  <td className="py-2.5 px-4 font-medium text-gray-900">{r.keywordText}</td>
                  <td className="py-2.5 px-4 text-center text-xs text-gray-500">{r.device}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-gray-400">{r.fromRank}위</td>
                  <td className="py-2.5 px-2 text-center text-gray-300 text-xs">→</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-gray-900 font-semibold">{r.toRank}위</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', improved ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500')}>
                      {improved ? `▲ ${Math.abs(r.diff)}` : `▼ ${r.diff}`}
                    </span>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      <Pager page={page} totalPages={totalPages} total={total} onPage={setPage} />
    </div>
  )
}

// ─── 전체 판단 로그 탭 (기존) ──────────────────────────────────────────────────
function AllLogsTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [decision, setDecision] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 순위 히스토리 패널
  const [historyKeyword, setHistoryKeyword] = useState<{ id: string; text: string } | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await logsApi.list({
        keywordText: search || undefined,
        decision: decision || undefined,
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
      })
      setLogs(prev => (sameHead(prev, res.data) ? prev : res.data))
      setTotal(res.total)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [search, decision, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const handleSearchInput = (val: string) => {
    setSearchInput(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setSearch(val)
      setPage(1)
    }, 400)
  }

  const handleDecision = (val: string) => {
    setDecision(val)
    setPage(1)
  }

  const openHistory = async (keywordId: string, keywordText: string) => {
    if (historyKeyword?.id === keywordId) {
      setHistoryKeyword(null)
      return
    }
    setHistoryKeyword({ id: keywordId, text: keywordText })
    setHistoryLoading(true)
    try {
      const res = await logsApi.rankHistory(keywordId)
      setHistory(res.data)
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <div className="flex gap-4 items-start">

      {/* ─── 메인 테이블 ─────────────────────────────────────────────── */}
      <div className={clsx('bg-white rounded-xl border border-gray-200 overflow-hidden transition-all', historyKeyword ? 'flex-1 min-w-0' : 'w-full')}>
        {/* 필터 */}
        <div className="px-4 py-3 border-b border-gray-100 flex gap-3 items-center flex-wrap">
          <input
            type="text"
            placeholder="키워드 검색"
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={decision}
            onChange={e => handleDecision(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">모든 판단</option>
            <option value="INCREASE">증액</option>
            <option value="DECREASE">감액</option>
            <option value="DECREASE_TEST">최저가탐색</option>
            <option value="HOLD">유지</option>
            <option value="COOLDOWN">대기</option>
            <option value="MAX_BID_REACHED">목표미달</option>
            <option value="RANK_CHECK_FAILED">조회실패</option>
          </select>
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <span className={clsx('inline-block', loading && 'animate-spin')}>↻</span>
            새로고침
          </button>
          <span className="ml-auto text-xs text-gray-400">{total.toLocaleString()}건</span>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 w-36">시간</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">키워드</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 w-24">판단</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 w-16">순위</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 w-24">변경 전</th>
              <th className="text-center py-3 px-2 text-xs font-medium text-gray-300 w-6"></th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 w-24">변경 후</th>
              {!historyKeyword && (
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">사유</th>
              )}
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 w-12">API</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={historyKeyword ? 8 : 9} className="py-16 text-center text-sm text-gray-400">불러오는 중...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={historyKeyword ? 8 : 9} className="py-16 text-center text-sm text-gray-400">
                  {search || decision ? '조건에 맞는 로그가 없습니다.' : '자동입찰이 시작되면 로그가 기록됩니다.'}
                </td>
              </tr>
            ) : (
              logs.map(log => {
                const meta = DECISION_META[log.decision]
                const bidChanged = log.beforeBid !== log.afterBid
                const isActive = historyKeyword?.id === log.keywordId
                return (
                  <tr
                    key={log.id}
                    className={clsx(
                      'border-b border-gray-50 transition-colors',
                      isActive ? 'bg-blue-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <td className="py-2.5 px-4 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                      {formatTime(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => openHistory(log.keywordId, log.keywordText)}
                        className={clsx(
                          'font-medium text-left hover:underline transition-colors',
                          isActive ? 'text-blue-600' : 'text-gray-900 hover:text-blue-600',
                        )}
                      >
                        {log.keywordText}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {meta ? (
                        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', meta.className)}>
                          {meta.icon} {meta.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{log.decision}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center text-gray-600 tabular-nums">
                      {log.beforeRank != null ? `${log.beforeRank}위` : <span className="text-gray-200">—</span>}
                    </td>
                    <td className={clsx('py-2.5 px-4 text-right tabular-nums font-mono text-sm', bidChanged ? 'text-gray-400' : 'text-gray-700')}>
                      {log.beforeBid.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center text-gray-300 text-xs">
                      {bidChanged ? '→' : ''}
                    </td>
                    <td className={clsx('py-2.5 px-4 text-right tabular-nums font-mono text-sm', bidChanged ? 'text-gray-900 font-semibold' : 'text-gray-400')}>
                      {bidChanged ? log.afterBid.toLocaleString() : '—'}
                    </td>
                    {!historyKeyword && (
                      <td className="py-2.5 px-4 text-xs text-gray-500 max-w-xs truncate">{log.reason ?? '—'}</td>
                    )}
                    <td className="py-2.5 px-4 text-center">
                      {log.apiSuccess === true && <span className="text-green-500 text-xs font-bold">✓</span>}
                      {log.apiSuccess === false && <span className="text-red-400 text-xs font-bold">✗</span>}
                      {log.apiSuccess == null && <span className="text-gray-200 text-xs">—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <Pager page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </div>

      {/* ─── 순위 히스토리 패널 ──────────────────────────────────────── */}
      {historyKeyword && (
        <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">순위 · 입찰가 이력</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{historyKeyword.text}</p>
            </div>
            <button
              onClick={() => setHistoryKeyword(null)}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none w-7 h-7 flex items-center justify-center"
            >
              ×
            </button>
          </div>

          {historyLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">이력이 없습니다.</div>
          ) : (
            <>
              {/* 스파크라인 */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-400 mb-2">순위 추이 (낮을수록 상위)</p>
                <RankSparkline data={history} />
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>{formatTimeShort(history[0].checkedAt)}</span>
                  <span>{formatTimeShort(history[history.length - 1].checkedAt)}</span>
                </div>
              </div>

              {/* 타임라인 */}
              <div className="overflow-y-auto max-h-[calc(100vh-360px)]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-gray-400">시간</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-400">순위</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-400">입찰가</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-400">판단</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((row, i, arr) => {
                      const prev = arr[i + 1]
                      const rankDiff = prev?.rank != null && row.rank != null ? row.rank - prev.rank : null
                      const meta = DECISION_META[row.decision]
                      return (
                        <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-400 tabular-nums whitespace-nowrap">
                            {formatTimeShort(row.checkedAt)}
                          </td>
                          <td className="py-2 px-2 text-center tabular-nums">
                            {row.rank != null ? (
                              <span className="font-medium text-gray-700">
                                {row.rank}위
                                {rankDiff !== null && rankDiff !== 0 && (
                                  <span className={clsx('ml-0.5 text-xs', rankDiff < 0 ? 'text-green-500' : 'text-red-400')}>
                                    {rankDiff < 0 ? `↑${Math.abs(rankDiff)}` : `↓${rankDiff}`}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-200">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-mono text-gray-700">
                            {row.bid.toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {meta ? (
                              <span className={clsx('px-1.5 py-0.5 rounded text-xs font-medium', meta.className)}>
                                {meta.icon}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function LogsPage() {
  const [tab, setTab] = useState<TabKey>('all')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">입찰 로그</h1>
        <p className="text-sm text-gray-500 mt-1">자동입찰 변경 이력을 확인합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' && <AllLogsTab />}
      {tab === 'bid' && <BidChangesTab />}
      {tab === 'rank' && <RankChangesTab />}
    </div>
  )
}
