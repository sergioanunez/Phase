"use client"

import { useEffect, useState } from "react"
import { MessageSquare, AlertTriangle, Loader2 } from "lucide-react"

type SmsHealth = {
  last24h: { sent: number; delivered: number; failed: number }
  last7d: { sent: number; failed: number; failureRatePercent: number }
  errorsByCompany: Array<{ companyId: string | null; companyName: string; failedCount: number }>
  recentFailures: Array<{
    id: string
    to: string
    from: string
    body: string
    createdAt: string
    companyId: string | null
    company?: { name: string }
  }>
}

export default function SuperAdminSmsPage() {
  const [data, setData] = useState<SmsHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/super-admin/sms/health")
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error)
        setData(res)
      })
      .catch((e) => {
        console.error(e)
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const d = data ?? {
    last24h: { sent: 0, delivered: 0, failed: 0 },
    last7d: { sent: 0, failed: 0, failureRatePercent: 0 },
    errorsByCompany: [],
    recentFailures: [],
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">SMS Health</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Sent (24h)</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{d.last24h.sent}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Delivered (24h)</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{d.last24h.delivered}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Failed (24h)</span>
          </div>
          <p className={`mt-1 text-2xl font-semibold ${d.last24h.failed > 0 ? "text-red-600" : "text-gray-900"}`}>
            {d.last24h.failed}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Sent (7d)</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{d.last7d.sent}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Failure rate (7d)</span>
          </div>
          <p className={`mt-1 text-2xl font-semibold ${d.last7d.failureRatePercent > 10 ? "text-red-600" : "text-gray-900"}`}>
            {d.last7d.failureRatePercent}%
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">Failures by company (7d)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Company
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Failed count
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {d.errorsByCompany.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-gray-500 sm:px-6">
                    No failures by company
                  </td>
                </tr>
              ) : (
                d.errorsByCompany.map((row) => (
                  <tr key={row.companyId ?? "unknown"} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 sm:px-6">
                      {row.companyName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600 sm:px-6">
                      {row.failedCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">Recent failed messages (7d)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  To
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:table-cell sm:px-6">
                  Body
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {d.recentFailures.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 sm:px-6">
                    No recent failures
                  </td>
                </tr>
              ) : (
                d.recentFailures.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 sm:px-6">
                      {msg.company?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 sm:px-6">
                      {msg.to}
                    </td>
                    <td className="hidden max-w-[200px] truncate px-4 py-3 text-sm text-gray-600 sm:table-cell sm:px-6">
                      {msg.body}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 sm:px-6">
                      {new Date(msg.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
