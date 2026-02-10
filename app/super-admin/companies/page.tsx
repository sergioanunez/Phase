"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, Building2, Loader2, UserCircle, Plus, Trash2 } from "lucide-react"

type CompanyRow = {
  id: string
  name: string
  pricingTier: string
  maxActiveHomes: number | null
  status: string
  userCount: number
  homeCount: number
  createdAt: string
}

export default function SuperAdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [tier, setTier] = useState("")
  const [status, setStatus] = useState("")
  const [nearLimit, setNearLimit] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createTier, setCreateTier] = useState("SMALL")
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchCompanies = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (tier) params.set("tier", tier)
    if (status) params.set("status", status)
    if (nearLimit) params.set("nearLimit", "true")
    fetch(`/api/super-admin/companies?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCompanies(Array.isArray(data) ? data : [])
      })
      .catch((e) => {
        console.error(e)
        setCompanies([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCompanies()
  }, [search, tier, status, nearLimit])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/super-admin/companies/${deleteId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete")
      setDeleteId(null)
      setDeleteName("")
      fetchCompanies()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!createName.trim()) return
    setCreateError("")
    setCreateLoading(true)
    fetch("/api/super-admin/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createName.trim(), pricingTier: createTier }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCreateOpen(false)
        setCreateName("")
        setCreateTier("SMALL")
        fetchCompanies()
      })
      .catch((err) => setCreateError(err instanceof Error ? err.message : "Failed to create company"))
      .finally(() => setCreateLoading(false))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">Company Directory</h1>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-64"
            />
          </div>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="rounded-md border border-gray-300 py-2 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All tiers</option>
            <option value="SMALL">SMALL</option>
            <option value="MID">MID</option>
            <option value="LARGE">LARGE</option>
            <option value="WHITE_LABEL">WHITE_LABEL</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-gray-300 py-2 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="TRIAL">TRIAL</option>
            <option value="DISABLED">DISABLED</option>
            <option value="PAST_DUE">PAST_DUE</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={nearLimit}
              onChange={(e) => setNearLimit(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            Near limit
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm md:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                    Active homes
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                    Users
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 sm:px-6">
                      No companies found
                    </td>
                  </tr>
                ) : (
                  companies.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 sm:px-6">
                        <Link href={`/super-admin/companies/${c.id}`} className="text-primary hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 sm:px-6">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {c.pricingTier}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm sm:px-6">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.status === "ACTIVE"
                              ? "bg-green-100 text-green-800"
                              : c.status === "TRIAL"
                                ? "bg-blue-100 text-blue-800"
                                : c.status === "DISABLED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600 sm:px-6">
                        {c.homeCount} / {c.maxActiveHomes ?? "∞"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600 sm:px-6">
                        {c.userCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm sm:px-6">
                        <Link
                          href={`/super-admin/companies/${c.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          View
                        </Link>
                        {" · "}
                        <Link
                          href={`/super-admin/companies/${c.id}?impersonate=1`}
                          className="font-medium text-primary hover:underline"
                        >
                          Impersonate
                        </Link>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => { setDeleteId(c.id); setDeleteName(c.name) }}
                          className="font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-4 md:hidden">
            {companies.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">No companies found</p>
            ) : (
              companies.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/super-admin/companies/${c.id}`}
                        className="font-medium text-primary hover:underline truncate block"
                      >
                        {c.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {c.pricingTier}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.status === "ACTIVE"
                              ? "bg-green-100 text-green-800"
                              : c.status === "TRIAL"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        {c.homeCount} / {c.maxActiveHomes ?? "∞"} homes · {c.userCount} users
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link
                        href={`/super-admin/companies/${c.id}`}
                        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                      >
                        View
                      </Link>
                      <Link
                        href={`/super-admin/companies/${c.id}?impersonate=1`}
                        className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <UserCircle className="h-4 w-4" />
                        Impersonate
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setDeleteId(c.id); setDeleteName(c.name) }}
                        className="flex items-center gap-1 rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Create company dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">New company</h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Company name"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tier</label>
                <select
                  value={createTier}
                  onChange={(e) => setCreateTier(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                >
                  <option value="SMALL">SMALL</option>
                  <option value="MID">MID</option>
                  <option value="LARGE">LARGE</option>
                  <option value="WHITE_LABEL">WHITE_LABEL</option>
                </select>
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setCreateOpen(false); setCreateError("") }}
                  className="flex-1 rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || !createName.trim()}
                  className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {createLoading ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete company?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete <strong>{deleteName}</strong> and all related data (homes, users, etc.). This cannot be undone.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => { setDeleteId(null); setDeleteName("") }}
                disabled={deleteLoading}
                className="flex-1 rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
