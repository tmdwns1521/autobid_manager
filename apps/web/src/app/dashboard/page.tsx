import { StatCard } from '@/components/ui/StatCard'
import { BiddingStateTable } from '@/components/ui/BiddingStateTable'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">자동입찰 현황을 확인합니다.</p>
      </div>

      {/* 상태 요약 카드 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="활성 키워드" value="–" sub="자동입찰 중" color="blue" />
        <StatCard label="목표순위 달성" value="–" sub="오늘 기준" color="green" />
        <StatCard label="입찰 변경" value="–" sub="오늘 총 횟수" color="purple" />
        <StatCard label="목표미달" value="–" sub="최대입찰가 도달" color="red" />
      </div>

      {/* 실시간 현황 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">실시간 자동입찰 현황</h2>
        <BiddingStateTable />
      </div>
    </div>
  )
}
