'use client'

import { clsx } from 'clsx'

const STATE_LABELS: Record<string, { label: string; className: string }> = {
  SEARCHING: { label: '탐색중', className: 'bg-yellow-100 text-yellow-700' },
  TARGET_REACHED: { label: '목표달성', className: 'bg-green-100 text-green-700' },
  MIN_CPC_TESTING: { label: '최저가탐색', className: 'bg-blue-100 text-blue-700' },
  COOLDOWN: { label: '반영대기', className: 'bg-gray-100 text-gray-600' },
  MAX_BID_REACHED: { label: '목표미달', className: 'bg-red-100 text-red-700' },
  PAUSED: { label: '일시정지', className: 'bg-gray-100 text-gray-400' },
}

export default function KeywordsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">키워드 관리</h1>
          <p className="text-sm text-gray-500 mt-1">자동입찰 규칙을 설정하고 현황을 확인합니다.</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
          + 자동입찰 설정
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {['전체', '탐색중', '목표달성', '최저가탐색', '목표미달', '반영대기'].map((f) => (
          <button
            key={f}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-full border transition',
              f === '전체'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">키워드</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">캠페인 / 그룹</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">목표순위</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">현재순위</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">현재입찰가</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">최소/최대</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">상태</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">자동입찰</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">최근변경</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={9} className="py-16 text-center text-sm text-gray-400">
                광고계정을 연동하면 키워드 목록이 표시됩니다.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
