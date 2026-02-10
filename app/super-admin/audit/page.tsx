"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

type AuditLog = {
  id: string
  action: string
  createdAt: string
  metaJson?: unknown
  user?: { id: string; name: string; email: string }
  company?: { id: string; name: string }
}

export default function SuperAdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize] = useState(20)
  const [companyId, setCompanyId] = useState("")
  const [action, setAction] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const fetchLogs = () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))
    if (companyId) params.set("companyId", companyId)
    if (action) params.set("action", action)
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    fetch(`/api/super-admin/audit?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setLogs(data.logs ?? [])
        setTotal(data.total ?? 0)
      })
      .catch((e) => {
        console.error(e)
        setLogs([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setPage(0)
  }, [companyId, action, from, to])

  useEffect(() => {
    fetchLogs()
  }, [page, pageSize, companyId, action, from, to])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">Global Audit Logs</h1>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Company ID</label>
            <input
              type="text"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="Filter by company"
              className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm sm:w-48"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Action</label>
            <input
              type="text"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. COMPANY_UPDATED"
              className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm sm:w-48"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">From date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm sm:w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">To date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm sm:w-40"
            />
          </div>
          <button
            type="button"
            onClick={() => setPage(0)}
            className="self-end rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">Timeline</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {total} total · page {page + 1} of {totalPages || 1}
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {logs.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-gray-500 sm:px-6">No audit logs</li>
            ) : (
              logs.map((log) => (
                <li key={log.id} className="px-4 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-gray-900">{log.action}</span>
                    <span className="text-sm text-gray-500">
                      {log.user?.name ?? "—"} · {log.company?.name ?? "—"} ·{" "}
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {log.metaJson != null ? (
                    <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
                      {JSON.stringify(log.metaJson, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
