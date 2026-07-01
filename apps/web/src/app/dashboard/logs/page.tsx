'use client'

import { clsx } from 'clsx'

const DECISION_LABELS: Record<string, { label: string; className: string }> = {
  INCREASE: { label: '증액', className: 'text-red-600' },
  DECREASE: { label: '감액', className: 'text-blue-600' },
  DECREASE_TEST: { label: '최저가테스트', className: 'text-blue-400' },
  RESTORE_STABLE_BID: { label: '복구', className: 'text-purple-600' },
  HOLD: { label: '유지', className: 'text-gray-500' },
  COOLDOWN: { label: '대기', className: 'text-gray-400' },
  MAX_BID_REACHED: { label: '최대가도달', className: 'text-orange-600' },
  MIN_BID_REACHED: { label: '최소가도달', className: 'text-indigo-600' },
  RANK_CHECK_FAILED: { label: '순위조회실패', className: 'text-orange-500' },
}

export default function LogsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">입찰 로그</h1>
        <p className="text-sm text-gray-500 mt-1">자동입찰 변경 이력을 확인합니다.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex gap-3 items-center">
          <input
            type="text"
            placeholder="키워드 검색"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
            <option>모든 판단</option>
            <option>증액</option>
            <option>감액</option>
            <option>최저가테스트</option>
            <option>목표미달</option>
          </select>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">시간</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">키워드</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">판단</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">순위</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">변경 전</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">변경 후</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">사유</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">API</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="py-16 text-center text-sm text-gray-400">
                자동입찰이 시작되면 로그가 기록됩니다.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
