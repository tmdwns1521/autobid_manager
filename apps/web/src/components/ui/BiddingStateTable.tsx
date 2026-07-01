'use client'

import { clsx } from 'clsx'

const STATE_LABELS: Record<string, { label: string; className: string }> = {
  SEARCHING: { label: '탐색중', className: 'bg-yellow-100 text-yellow-700' },
  TARGET_REACHED: { label: '목표달성', className: 'bg-green-100 text-green-700' },
  MIN_CPC_TESTING: { label: '최저가탐색', className: 'bg-blue-100 text-blue-700' },
  COOLDOWN: { label: '반영대기', className: 'bg-gray-100 text-gray-600' },
  MAX_BID_REACHED: { label: '목표미달', className: 'bg-red-100 text-red-700' },
  RANK_CHECK_FAILED: { label: '순위조회실패', className: 'bg-orange-100 text-orange-700' },
  PAUSED: { label: '일시정지', className: 'bg-gray-100 text-gray-400' },
  ERROR: { label: '오류', className: 'bg-red-100 text-red-700' },
}

// 실제 구현 시 useSWR로 API 연동
const MOCK_DATA = [
  { keyword: '강남역 피부과', targetRank: 3, currentRank: 4, currentBid: 1200, state: 'SEARCHING', lastChecked: '2분 전' },
  { keyword: '서초 치과', targetRank: 3, currentRank: 3, currentBid: 900, state: 'TARGET_REACHED', lastChecked: '1분 전' },
  { keyword: '역삼동 한의원', targetRank: 5, currentRank: 2, currentBid: 700, state: 'MIN_CPC_TESTING', lastChecked: '3분 전' },
  { keyword: '강남 맛집', targetRank: 3, currentRank: 8, currentBid: 3000, state: 'MAX_BID_REACHED', lastChecked: '5분 전' },
]

export function BiddingStateTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">키워드</th>
            <th className="text-center py-2 px-3 text-xs font-medium text-gray-500">목표순위</th>
            <th className="text-center py-2 px-3 text-xs font-medium text-gray-500">현재순위</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">현재입찰가</th>
            <th className="text-center py-2 px-3 text-xs font-medium text-gray-500">상태</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">최근조회</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_DATA.map((row) => {
            const stateInfo = STATE_LABELS[row.state] ?? { label: row.state, className: 'bg-gray-100 text-gray-600' }
            return (
              <tr key={row.keyword} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-3 font-medium text-gray-900">{row.keyword}</td>
                <td className="py-3 px-3 text-center text-gray-600">{row.targetRank}위</td>
                <td className="py-3 px-3 text-center">
                  <span className={clsx(
                    'font-semibold',
                    row.currentRank <= row.targetRank ? 'text-green-600' : 'text-red-500'
                  )}>
                    {row.currentRank}위
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-gray-700">{row.currentBid.toLocaleString()}원</td>
                <td className="py-3 px-3 text-center">
                  <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', stateInfo.className)}>
                    {stateInfo.label}
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-gray-400 text-xs">{row.lastChecked}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
