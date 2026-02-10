"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Loader2,
  Building2,
  Users,
  CreditCard,
  Palette,
  FileText,
  UserCircle,
  AlertTriangle,
  Plus,
} from "lucide-react"

type CompanyDetail = {
  id: string
  name: string
  pricingTier: string
  maxActiveHomes: number | null
  status: string
  timezone: string | null
  monthlyPriceCents: number | null
  renewalDate: string | null
  billingStatus: string | null
  notes: string | null
  brandAppName: string | null
  brandLogoUrl: string | null
  brandPrimaryColor: string | null
  brandAccentColor: string | null
  usage: {
    activeHomes: number
    homesCompleted30d: number
    tasksScheduled30d: number
    smsSent30d: number
    smsFailed30d: number
    confirmationRate30d: number | null
  }
  users: Array<{
    id: string
    name: string
    email: string
    role: string
    status: string
    isActive: boolean
  }>
}

type TabId = "overview" | "users" | "billing" | "whitelabel" | "audit"

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "whitelabel", label: "White Label", icon: Palette },
  { id: "audit", label: "Audit Logs", icon: FileText },
]

export default function SuperAdminCompanyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const companyId = params.companyId as string
  const tabParam = searchParams.get("tab") as TabId | null
  const wantImpersonate = searchParams.get("impersonate") === "1"

  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>(tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "overview")
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; createdAt: string; user?: { name: string; email: string }; metaJson?: unknown }>>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [impersonateUserId, setImpersonateUserId] = useState<string>("")
  const [addAdminOpen, setAddAdminOpen] = useState(false)
  const [addAdminName, setAddAdminName] = useState("")
  const [addAdminEmail, setAddAdminEmail] = useState("")
  const [addAdminPassword, setAddAdminPassword] = useState("")
  const [addAdminLoading, setAddAdminLoading] = useState(false)
  const [addAdminError, setAddAdminError] = useState("")

  const fetchCompany = useCallback(() => {
    setLoading(true)
    fetch(`/api/super-admin/companies/${companyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCompany(data)
      })
      .catch((e) => {
        console.error(e)
        setCompany(null)
      })
      .finally(() => setLoading(false))
  }, [companyId])

  useEffect(() => {
    fetchCompany()
  }, [fetchCompany])

  useEffect(() => {
    if (tab === "audit" && companyId) {
      setAuditLoading(true)
      fetch(`/api/super-admin/audit?companyId=${companyId}&pageSize=30`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) throw new Error(data.error)
          setAuditLogs(data.logs ?? [])
        })
        .catch(() => setAuditLogs([]))
        .finally(() => setAuditLoading(false))
    }
  }, [tab, companyId])

  const handlePatch = (body: Record<string, unknown>) => {
    setSaving(true)
    fetch(`/api/super-admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCompany((prev) => (prev ? { ...prev, ...data } : data))
      })
      .catch((e) => console.error(e))
      .finally(() => setSaving(false))
  }

  const handleImpersonate = (userId: string) => {
    if (!userId) return
    fetch("/api/super-admin/impersonation/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, userIdToImpersonate: userId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        router.push("/dashboard")
        router.refresh()
      })
      .catch((e) => console.error(e))
  }

  if (loading && !company) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }
  if (!company) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        Company not found. <Link href="/super-admin/companies" className="underline">Back to companies</Link>
      </div>
    )
  }

  const adminUsers = company.users.filter((u) =>
    ["Admin", "Manager", "Superintendent"].includes(u.role)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/super-admin/companies"
            className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Companies
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">{company.name}</h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              company.status === "ACTIVE"
                ? "bg-green-100 text-green-800"
                : company.status === "TRIAL"
                  ? "bg-blue-100 text-blue-800"
                  : company.status === "DISABLED"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-700"
            }`}
          >
            {company.status}
          </span>
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {company.pricingTier}
          </span>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex flex-wrap gap-2" aria-label="Tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Active homes</p>
              <p className="text-2xl font-semibold text-gray-900">
                {company.usage.activeHomes} / {company.maxActiveHomes ?? "∞"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Tasks scheduled (30d)</p>
              <p className="text-2xl font-semibold text-gray-900">{company.usage.tasksScheduled30d}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">SMS sent (30d)</p>
              <p className="text-2xl font-semibold text-gray-900">{company.usage.smsSent30d}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Confirmation rate (30d)</p>
              <p className="text-2xl font-semibold text-gray-900">
                {company.usage.confirmationRate30d != null ? `${company.usage.confirmationRate30d}%` : "—"}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Quick actions</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              <select
                value={company.status}
                onChange={(e) => handlePatch({ status: e.target.value })}
                disabled={saving}
                className="rounded-md border border-gray-300 py-2 px-3 text-sm"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="TRIAL">TRIAL</option>
                <option value="DISABLED">DISABLED</option>
                <option value="PAST_DUE">PAST_DUE</option>
              </select>
              <select
                value={company.pricingTier}
                onChange={(e) => handlePatch({ pricingTier: e.target.value })}
                disabled={saving}
                className="rounded-md border border-gray-300 py-2 px-3 text-sm"
              >
                <option value="SMALL">SMALL</option>
                <option value="MID">MID</option>
                <option value="LARGE">LARGE</option>
                <option value="WHITE_LABEL">WHITE_LABEL</option>
              </select>
              <input
                type="number"
                min={1}
                placeholder="Max active homes"
                defaultValue={company.maxActiveHomes ?? ""}
                onBlur={(e) => {
                  const v = e.target.value
                  const num = v === "" ? null : parseInt(v, 10)
                  if (num !== null && (isNaN(num) || num < 1)) return
                  handlePatch({ maxActiveHomes: num })
                }}
                disabled={saving}
                className="w-32 rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
              {company.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => setConfirmDisable(true)}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Disable company
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Company users</h3>
            <button
              type="button"
              onClick={() => { setAddAdminOpen(true); setAddAdminError(""); setAddAdminName(""); setAddAdminEmail(""); setAddAdminPassword(""); }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Admin user
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
              <h4 className="text-sm font-medium text-gray-700">Users in this company</h4>
            </div>
            <ul className="divide-y divide-gray-200">
              {company.users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
                  <div>
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                    <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {u.role}
                    </span>
                    {!u.isActive && (
                      <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {adminUsers.some((a) => a.id === u.id) && (
                      <button
                        type="button"
                        onClick={() => handleImpersonate(u.id)}
                        className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <UserCircle className="h-4 w-4" />
                        Impersonate
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {wantImpersonate && adminUsers.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Impersonate as
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  value={impersonateUserId}
                  onChange={(e) => setImpersonateUserId(e.target.value)}
                  className="rounded-md border border-amber-300 py-2 px-3 text-sm"
                >
                  <option value="">Select user</option>
                  {adminUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleImpersonate(impersonateUserId)}
                  disabled={!impersonateUserId}
                  className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Start impersonation
                </button>
              </div>
            </div>
          )}

          {/* Add Admin user dialog */}
          {addAdminOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900">Add Admin user</h3>
                <p className="mt-1 text-sm text-gray-500">Create a new Admin user for {company.name}</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setAddAdminError("")
                    setAddAdminLoading(true)
                    try {
                      const res = await fetch(`/api/companies/${companyId}/admin-user`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: addAdminName.trim(),
                          email: addAdminEmail.trim().toLowerCase(),
                          password: addAdminPassword,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || "Failed to create user")
                      setAddAdminOpen(false)
                      setAddAdminName("")
                      setAddAdminEmail("")
                      setAddAdminPassword("")
                      fetchCompany()
                    } catch (err) {
                      setAddAdminError(err instanceof Error ? err.message : "Failed to create user")
                    } finally {
                      setAddAdminLoading(false)
                    }
                  }}
                  className="mt-4 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      value={addAdminName}
                      onChange={(e) => setAddAdminName(e.target.value)}
                      placeholder="Full name"
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={addAdminEmail}
                      onChange={(e) => setAddAdminEmail(e.target.value)}
                      placeholder="admin@company.com"
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input
                      type="password"
                      value={addAdminPassword}
                      onChange={(e) => setAddAdminPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      required
                      minLength={6}
                      className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                    />
                  </div>
                  {addAdminError && <p className="text-sm text-red-600">{addAdminError}</p>}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setAddAdminOpen(false); setAddAdminError("") }}
                      className="flex-1 rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addAdminLoading || !addAdminName.trim() || !addAdminEmail.trim() || addAdminPassword.length < 6}
                      className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {addAdminLoading ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "billing" && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-gray-900">Billing (manual MVP)</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Monthly price (cents)</label>
              <input
                type="number"
                value={company.monthlyPriceCents ?? ""}
                onChange={(e) => {
                  const v = e.target.value
                  handlePatch({ monthlyPriceCents: v === "" ? null : parseInt(v, 10) })
                }}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Renewal date</label>
              <input
                type="date"
                value={company.renewalDate ? company.renewalDate.slice(0, 10) : ""}
                onChange={(e) =>
                  handlePatch({ renewalDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                disabled={saving}
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Billing status</label>
              <select
                value={company.billingStatus ?? ""}
                onChange={(e) =>
                  handlePatch({
                    billingStatus: e.target.value === "" ? null : (e.target.value as "OK" | "PAST_DUE" | "CANCELED"),
                  })
                }
                disabled={saving}
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              >
                <option value="">—</option>
                <option value="OK">OK</option>
                <option value="PAST_DUE">PAST_DUE</option>
                <option value="CANCELED">CANCELED</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={company.notes ?? ""}
                onChange={(e) => handlePatch({ notes: e.target.value || null })}
                disabled={saving}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {tab === "whitelabel" && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-gray-900">White label</h3>
          <p className="mt-1 text-sm text-gray-500">
            Shown when tier is WHITE_LABEL or enabled per company.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">App name</label>
              <input
                type="text"
                value={company.brandAppName ?? ""}
                onChange={(e) => handlePatch({ brandAppName: e.target.value || null })}
                disabled={saving}
                placeholder="Phase"
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Logo URL</label>
              <input
                type="url"
                value={company.brandLogoUrl ?? ""}
                onChange={(e) => handlePatch({ brandLogoUrl: e.target.value || null })}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Primary color</label>
              <input
                type="text"
                value={company.brandPrimaryColor ?? ""}
                onChange={(e) => handlePatch({ brandPrimaryColor: e.target.value || null })}
                disabled={saving}
                placeholder="#0066cc"
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Accent color</label>
              <input
                type="text"
                value={company.brandAccentColor ?? ""}
                onChange={(e) => handlePatch({ brandAccentColor: e.target.value || null })}
                disabled={saving}
                placeholder="#ff6600"
                className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
            <h3 className="text-base font-semibold text-gray-900">Audit logs (this company)</h3>
          </div>
          {auditLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {auditLogs.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-gray-500 sm:px-6">No audit logs</li>
              ) : (
                auditLogs.map((log) => (
                  <li key={log.id} className="px-4 py-3 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900">{log.action}</span>
                      <span className="text-sm text-gray-500">
                        {log.user?.name ?? "—"} · {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
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
        </div>
      )}

      {confirmDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-gray-900">Disable company?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Users will not be able to sign in. You can re-enable later.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  handlePatch({ status: "DISABLED" })
                  setConfirmDisable(false)
                }}
                className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Disable
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisable(false)}
                className="flex-1 rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
