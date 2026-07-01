'use client'

import { useState } from 'react'

export default function AccountsPage() {
  const [form, setForm] = useState({
    accountName: '',
    naverCustomerId: '',
    accessLicense: '',
    secretKey: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: POST /api/ad-accounts
    alert('계정 연동 API 연결 예정')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">계정 연동</h1>
        <p className="text-sm text-gray-500 mt-1">네이버 검색광고 API 키를 등록합니다.</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
        API 키는 네이버 광고주센터 → SA API 사용 관리에서 발급받을 수 있습니다. 계정 책임자 권한이 필요합니다.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg">
        <h2 className="text-sm font-semibold text-gray-700 mb-5">새 광고계정 연동</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">계정 이름</label>
            <input
              type="text"
              placeholder="예: 강남 피부과 광고계정"
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer ID</label>
            <input
              type="text"
              placeholder="네이버 고객 ID"
              value={form.naverCustomerId}
              onChange={(e) => setForm({ ...form, naverCustomerId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Access License</label>
            <input
              type="text"
              placeholder="엑세스 라이선스 키"
              value={form.accessLicense}
              onChange={(e) => setForm({ ...form, accessLicense: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Secret Key</label>
            <input
              type="password"
              placeholder="비밀키"
              value={form.secretKey}
              onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              연동하기
            </button>
          </div>
        </form>
      </div>

      {/* 연동된 계정 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">연동된 계정</h2>
        <p className="text-sm text-gray-400 text-center py-8">아직 연동된 계정이 없습니다.</p>
      </div>
    </div>
  )
}
