'use client'

import { useState, useEffect } from 'react'
import { adAccountsApi } from '@/lib/api'

interface AdAccount {
  id: string
  accountName: string
  naverCustomerId: string
  status: string
  lastSyncedAt: string | null
  createdAt: string
  _count: { campaigns: number }
}

export default function AccountsPage() {
  const [form, setForm] = useState({
    accountName: '',
    naverCustomerId: '',
    accessLicense: '',
    secretKey: '',
  })
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadAccounts = async () => {
    try {
      const data = await adAccountsApi.list()
      setAccounts(data)
    } catch {
      // 실패 시 빈 배열 유지
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await adAccountsApi.create(form)
      setForm({ accountName: '', naverCustomerId: '', accessLicense: '', secretKey: '' })
      await loadAccounts()
    } catch (err: any) {
      setError(err.response?.data?.message || '연동 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async (id: string) => {
    setSyncingId(id)
    try {
      const result = await adAccountsApi.sync(id)
      alert(`동기화 완료: 캠페인 ${result.campaigns}개, 키워드 ${result.keywords}개`)
      await loadAccounts()
    } catch (err: any) {
      alert(err.response?.data?.message || '동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncingId(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 계정을 삭제하시겠습니까?`)) return
    try {
      await adAccountsApi.remove(id)
      await loadAccounts()
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    }
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
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>
          )}
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
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading ? '연동 중...' : '연동하기'}
            </button>
          </div>
        </form>
      </div>

      {/* 연동된 계정 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-3xl">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">연동된 계정</h2>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">아직 연동된 계정이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">계정명</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Customer ID</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">캠페인</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500">상태</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500">마지막 동기화</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{acc.accountName}</td>
                  <td className="py-3 px-4 text-gray-500 font-mono text-xs">{acc.naverCustomerId}</td>
                  <td className="py-3 px-4 text-center text-gray-600">{acc._count.campaigns}개</td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      {acc.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-gray-400">
                    {acc.lastSyncedAt ? new Date(acc.lastSyncedAt).toLocaleString('ko-KR') : '미동기화'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleSync(acc.id)}
                        disabled={syncingId === acc.id}
                        className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50"
                      >
                        {syncingId === acc.id ? '동기화 중...' : '동기화'}
                      </button>
                      <button
                        onClick={() => handleDelete(acc.id, acc.accountName)}
                        className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-md hover:bg-red-100"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
