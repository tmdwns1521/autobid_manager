import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="max-w-2xl w-full px-6 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          AutoBid Manager
        </h1>
        <p className="text-lg text-gray-500 mb-2">
          네이버 광고 자동입찰 관리 솔루션
        </p>
        <p className="text-sm text-gray-400 mb-10">
          순위는 관리하고, CPC는 줄이고, 반복 업무는 자동화합니다.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            대시보드 이동
          </Link>
          <Link
            href="/auth/login"
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            로그인
          </Link>
        </div>
      </div>
    </div>
  )
}
