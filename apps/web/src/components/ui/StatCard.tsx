import { clsx } from 'clsx'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: 'blue' | 'green' | 'purple' | 'red' | 'gray'
}

const COLOR_MAP = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  purple: 'bg-purple-50 text-purple-700',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-gray-50 text-gray-700',
}

export function StatCard({ label, value, sub, color = 'gray' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={clsx('text-2xl font-bold mt-1', COLOR_MAP[color])}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
