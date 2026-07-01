'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/dashboard', label: '대시보드', icon: '📊' },
  { href: '/dashboard/accounts', label: '계정 연동', icon: '🔗' },
  { href: '/dashboard/keywords', label: '키워드 관리', icon: '🔑' },
  { href: '/dashboard/logs', label: '입찰 로그', icon: '📋' },
  { href: '/dashboard/reports', label: '리포트', icon: '📈' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-base font-bold text-blue-600">AutoBid Manager</span>
        <p className="text-xs text-gray-400 mt-0.5">네이버 광고 자동입찰</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">v1.0.0 MVP</p>
      </div>
    </aside>
  )
}
