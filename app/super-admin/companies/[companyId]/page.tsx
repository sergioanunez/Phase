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
  FileText,
  UserCircle,
  AlertTriangle,
  Plus,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

type CompanyDetail = {
  id: string
  name: string
  pricingTier: string
  maxActiveHomes: number | null
  status: string
  subscriptionStatus?: string | null
  planKey?: string | null
  timezone: string | null
  monthlyPriceCents: number | null
  renewalDate: string | null
  billingStatus: string | null
  notes: string | null
  brandAppName: string | null
  brandLogoUrl: string | null
  brandPrimaryColor: string | null
  brandAccentColor: string | null
  trialStartsAt?: string | null
  trialEndsAt?: string | null
  trialResetCount?: number
  lastTrialResetAt?: string | null
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

type TabId = "overview" | "users" | "billing" | "audit"

type BillingDebugPayload = {
  company: { id: string; name: string; planName: string }
  entitlement: {
    access: "ACTIVE" | "LIMITED"
    reason: string
    limitedCapabilities: string[]
    evaluatedAt: string
  }
  stripe: {
    mode: "test" | "live"
    customerId: string | null
    subscriptionId: string | null
    subscriptionStatus: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean | null
    priceId: string | null
    productId: string | null
    latestInvoiceStatus: string | null
    hostedInvoiceUrl: string | null
    lastWebhook: { type: string; receivedAt: string } | null
    lastSync: { syncedAt: string; result: "ok" | "error"; message?: string } | null
    stripeDashboardUrls: { customer?: string; subscription?: string; invoice?: string }
  }
  manual: {
    overrideActive: boolean
    overrideUntil: string | null
    notes: string | null
  }
}

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
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

  const [billingDebug, setBillingDebug] = useState<BillingDebugPayload | null>(null)
  const [billingDebugLoading, setBillingDebugLoading] = useState(false)
  const [billingDebugError, setBillingDebugError] = useState<string | null>(null)
  const [billingSyncLoading, setBillingSyncLoading] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [manualOverrideStatus, setManualOverrideStatus] = useState<string>("")
  const [manualOverrideUntil, setManualOverrideUntil] = useState<string>("")
  const [manualOverrideNotes, setManualOverrideNotes] = useState<string>("")

  const [trialDialogOpen, setTrialDialogOpen] = useState(false)
  const [trialMode, setTrialMode] = useState<"RESET" | "EXTEND">("RESET")
  const [trialExtendDays, setTrialExtendDays] = useState<string>("7")
  const [trialSaving, setTrialSaving] = useState(false)
  const [trialError, setTrialError] = useState<string | null>(null)
  const [trialSuccess, setTrialSuccess] = useState(false)

  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchCompany = useCallback(() => {
    setLoading(true)
    setFetchError(null)
    fetch(`/api/super-admin/companies/${companyId}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          const msg = data.error || (r.status === 404 ? "Company not found" : "Failed to load company")
          throw new Error(msg)
        }
        if (data.error) throw new Error(data.error)
        return data
      })
      .then(setCompany)
      .catch((e) => {
        console.error(e)
        setCompany(null)
        setFetchError(e instanceof Error ? e.message : "Failed to load company")
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

  useEffect(() => {
    if (tab !== "billing" || !companyId) return
    setBillingDebugError(null)
    setBillingDebugLoading(true)
    fetch(`/api/super-admin/companies/${companyId}/billing-debug`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setBillingDebug(data)
      })
      .catch((e) => {
        setBillingDebugError(e instanceof Error ? e.message : "Failed to load billing debug")
        setBillingDebug(null)
      })
      .finally(() => setBillingDebugLoading(false))
  }, [tab, companyId])

  useEffect(() => {
    if (tab === "billing" && company) {
      setManualOverrideStatus(company.status ?? "")
      setManualOverrideUntil(company.renewalDate ? company.renewalDate.slice(0, 10) : "")
      setManualOverrideNotes(company.notes ?? "")
    }
  }, [tab, company])

  const refetchBillingDebug = useCallback(() => {
    if (!companyId) return
    fetch(`/api/super-admin/companies/${companyId}/billing-debug`)
      .then((r) => r.json())
      .then((data) => !data.error && setBillingDebug(data))
  }, [companyId])

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
        {fetchError || "Company not found"}. <Link href="/super-admin/companies" className="underline">Back to companies</Link>
      </div>
    )
  }

  const adminUsers = company.users.filter((u) =>
    ["Admin", "Manager", "Superintendent"].includes(u.role)
  )

  const planLabel =
    company.planKey && typeof company.planKey === "string"
      ? {
          starter: "Starter",
          growth: "Growth",
          scale: "Scale",
        }[company.planKey.toLowerCase() as "starter" | "growth" | "scale"] ?? company.planKey
      : "No subscription"
  const whiteLabelEnabled = company.pricingTier === "WHITE_LABEL"

  const handleTrialSubmit = () => {
    if (!company) return
    setTrialError(null)
    setTrialSuccess(false)
    let days: number | undefined
    if (trialMode === "EXTEND") {
      const n = parseInt(trialExtendDays, 10)
      if (Number.isNaN(n) || n <= 0) {
        setTrialError("Days must be a positive integer.")
        return
      }
      if (n > 365) {
        setTrialError("Extension cannot exceed 365 days.")
        return
      }
      days = n
    }
    setTrialSaving(true)
    fetch(`/api/super-admin/tenants/${company.id}/trial-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: trialMode,
        ...(trialMode === "EXTEND" ? { days } : {}),
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok || data.error) {
          throw new Error(data.error || "Failed to update trial.")
        }
        setCompany((prev) => (prev ? { ...prev, ...data } : data))
        setTrialSuccess(true)
        setTrialDialogOpen(false)
      })
      .catch((e: any) => {
        setTrialError(e?.message || "Failed to update trial.")
      })
      .finally(() => setTrialSaving(false))
  }

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
            {planLabel}
            {whiteLabelEnabled ? " · White Label" : ""}
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
              <div className="flex flex-col justify-center text-xs text-gray-700 space-y-0.5">
                <span>
                  <strong>Plan:</strong> {planLabel}
                </span>
                <span>
                  <strong>White Label add-on:</strong> {whiteLabelEnabled ? "Enabled" : "Not enabled"}
                </span>
                <span className="text-[11px] text-gray-500">
                  To change plan or White Label, impersonate the tenant and use their Billing page.
                </span>
              </div>
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

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-900">Trial management</h3>
            <p className="mt-1 text-sm text-amber-800">
              View and adjust this tenant&apos;s trial period. This action overrides the current trial period.
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-3 text-sm text-gray-900 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-amber-900/80">Subscription status</dt>
                <dd className="mt-0.5">
                  {company.subscriptionStatus ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-amber-900/80">Trial started</dt>
                <dd className="mt-0.5">
                  {company.trialStartsAt ? new Date(company.trialStartsAt).toLocaleDateString() : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-amber-900/80">Trial ends</dt>
                <dd className="mt-0.5">
                  {company.trialEndsAt ? new Date(company.trialEndsAt).toLocaleDateString() : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-amber-900/80">Days remaining</dt>
                <dd className="mt-0.5">
                  {company.trialEndsAt
                    ? Math.max(
                        0,
                        Math.ceil(
                          (new Date(company.trialEndsAt).getTime() - Date.now()) /
                            (24 * 60 * 60 * 1000)
                        )
                      )
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-3 text-xs text-amber-900/90">
              <p>This tool is for internal operations. Only Super Admins can access it.</p>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setTrialMode("RESET")
                  setTrialError(null)
                  setTrialSuccess(false)
                  setTrialDialogOpen(true)
                }}
                className="inline-flex items-center rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-800"
              >
                Reset trial to 30 days
              </button>
              <div className="flex items-center gap-2">
                <label className="text-sm text-amber-900" htmlFor="extendDays">
                  Extend by
                </label>
                <input
                  id="extendDays"
                  type="number"
                  min={1}
                  max={365}
                  value={trialExtendDays}
                  onChange={(e) => setTrialExtendDays(e.target.value)}
                  className="w-20 rounded-md border border-amber-300 px-2 py-1 text-sm"
                />
                <span className="text-sm text-amber-900">days</span>
                <button
                  type="button"
                  onClick={() => {
                    setTrialMode("EXTEND")
                    setTrialError(null)
                    setTrialSuccess(false)
                    setTrialDialogOpen(true)
                  }}
                  className="inline-flex items-center rounded-md border border-amber-700 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  Extend trial
                </button>
              </div>
            </div>
            <div className="mt-2 text-xs text-amber-900/80">
              <p>
                Resets: {company.trialResetCount ?? 0}
                {company.lastTrialResetAt &&
                  ` · Last reset ${new Date(company.lastTrialResetAt).toLocaleString()}`}
              </p>
            </div>
            {trialError && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {trialError}
              </p>
            )}
            {trialSuccess && (
              <p className="mt-2 text-sm text-green-700" role="status">
                Trial updated successfully.
              </p>
            )}
          </div>
        </div>
      )}

      <Dialog open={trialDialogOpen} onOpenChange={(open) => !trialSaving && setTrialDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify tenant trial</DialogTitle>
            <DialogDescription>
              Are you sure you want to modify this tenant&apos;s trial? This action overrides the current trial
              period.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 text-sm text-gray-800">
            <p>
              Mode: <span className="font-semibold">{trialMode === "RESET" ? "Reset to 30 days" : `Extend by ${trialExtendDays || "N"} days`}</span>
            </p>
          </div>
          <DialogFooter className="mt-4">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setTrialDialogOpen(false)}
              disabled={trialSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-800 disabled:opacity-60"
              onClick={handleTrialSubmit}
              disabled={trialSaving}
            >
              {trialSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                "Confirm"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <div className="space-y-6">
          {billingDebugLoading && (
            <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}
          {billingDebugError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {billingDebugError}
            </div>
          )}
          {!billingDebugLoading && billingDebug && (
            <>
              {billingDebug.stripe.mode === "test" && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <span>Test mode — Stripe data is from test keys.</span>
                </div>
              )}

              {/* A) Access Status */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
                  <h3 className="text-base font-semibold text-gray-900">Access Status</h3>
                </div>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full px-4 py-1.5 text-lg font-semibold ${
                        billingDebug.entitlement.access === "ACTIVE"
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {billingDebug.entitlement.access}
                    </span>
                    <span className="text-sm text-gray-600">
                      Reason: <span className="font-mono font-medium">{billingDebug.entitlement.reason}</span>
                    </span>
                    <span className="text-sm text-gray-500">
                      Evaluated: {new Date(billingDebug.entitlement.evaluatedAt).toLocaleString()}
                    </span>
                  </div>
                  {billingDebug.entitlement.limitedCapabilities.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600">
                      Limited: {billingDebug.entitlement.limitedCapabilities.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* B) Stripe Snapshot */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
                  <h3 className="text-base font-semibold text-gray-900">Stripe Snapshot</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 sm:px-6">
                  <div>
                    <span className="text-xs font-medium text-gray-500">Customer ID</span>
                    <p className="font-mono text-sm text-gray-900">{billingDebug.stripe.customerId ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Subscription ID</span>
                    <p className="font-mono text-sm text-gray-900">{billingDebug.stripe.subscriptionId ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Subscription status</span>
                    <p className="font-mono text-sm text-gray-900">{billingDebug.stripe.subscriptionStatus ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Current period end</span>
                    <p className="text-sm text-gray-900">
                      {billingDebug.stripe.currentPeriodEnd
                        ? new Date(billingDebug.stripe.currentPeriodEnd).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Cancel at period end</span>
                    <p className="text-sm text-gray-900">
                      {billingDebug.stripe.cancelAtPeriodEnd == null ? "—" : billingDebug.stripe.cancelAtPeriodEnd ? "Yes" : "No"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Price ID</span>
                    <p className="font-mono text-sm text-gray-900">{billingDebug.stripe.priceId ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Product ID</span>
                    <p className="font-mono text-sm text-gray-900">{billingDebug.stripe.productId ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Latest invoice status</span>
                    <p className="font-mono text-sm text-gray-900">{billingDebug.stripe.latestInvoiceStatus ?? "—"}</p>
                  </div>
                  {billingDebug.stripe.hostedInvoiceUrl && (
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500">Hosted invoice URL</span>
                      <p className="truncate font-mono text-sm text-blue-600">
                        <a href={billingDebug.stripe.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                          {billingDebug.stripe.hostedInvoiceUrl}
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* C) Webhook & Sync Health */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
                  <h3 className="text-base font-semibold text-gray-900">Webhook & Sync Health</h3>
                </div>
                <div className="px-4 py-4 sm:px-6 space-y-4">
                  {billingDebug.stripe.lastWebhook && (
                    <p className="text-sm text-gray-600">
                      Last webhook: <span className="font-mono">{billingDebug.stripe.lastWebhook.type}</span> at{" "}
                      {new Date(billingDebug.stripe.lastWebhook.receivedAt).toLocaleString()}
                    </p>
                  )}
                  {billingDebug.stripe.lastSync && (
                    <p className="text-sm text-gray-600">
                      Last sync: {billingDebug.stripe.lastSync.result}{" "}
                      {billingDebug.stripe.lastSync.message ? `— ${billingDebug.stripe.lastSync.message}` : ""} at{" "}
                      {new Date(billingDebug.stripe.lastSync.syncedAt).toLocaleString()}
                    </p>
                  )}
                  {!billingDebug.stripe.lastWebhook && !billingDebug.stripe.lastSync && (
                    <p className="text-sm text-gray-500">No webhook or sync recorded yet.</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={billingSyncLoading}
                      onClick={async () => {
                        setBillingSyncLoading(true)
                        try {
                          const res = await fetch(`/api/super-admin/companies/${companyId}/billing-sync`, {
                            method: "POST",
                          })
                          const data = await res.json()
                          if (data.error) throw new Error(data.error)
                          setBillingDebug((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  stripe: {
                                    ...prev.stripe,
                                    lastSync: {
                                      syncedAt: data.syncedAt ?? new Date().toISOString(),
                                      result: data.ok ? "ok" : "error",
                                      message: data.debug?.message,
                                    },
                                  },
                                }
                              : prev
                          )
                          refetchBillingDebug()
                          if (company) fetchCompany()
                        } catch (e) {
                          console.error(e)
                        } finally {
                          setBillingSyncLoading(false)
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {billingSyncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Sync from Stripe now
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const json = JSON.stringify(billingDebug, null, 2)
                        navigator.clipboard.writeText(json).then(() => {
                          setCopySuccess(true)
                          setTimeout(() => setCopySuccess(false), 2000)
                        })
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {copySuccess ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copySuccess ? "Copied!" : "Copy Debug JSON"}
                    </button>
                    {billingDebug.stripe.stripeDashboardUrls.customer && (
                      <a
                        href={billingDebug.stripe.stripeDashboardUrls.customer}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Stripe customer
                      </a>
                    )}
                    {billingDebug.stripe.stripeDashboardUrls.subscription && (
                      <a
                        href={billingDebug.stripe.stripeDashboardUrls.subscription}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Stripe subscription
                      </a>
                    )}
                    {billingDebug.stripe.stripeDashboardUrls.invoice && (
                      <a
                        href={billingDebug.stripe.stripeDashboardUrls.invoice}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Stripe invoice
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* D) Manual Override */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
                  <h3 className="text-base font-semibold text-gray-900">Manual Override</h3>
                  <p className="mt-1 text-sm text-gray-500">Changes are audited. Use to force access or extend renewal.</p>
                </div>
                <div className="px-4 py-4 sm:px-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Override status</label>
                      <select
                        value={manualOverrideStatus}
                        onChange={(e) => setManualOverrideStatus(e.target.value)}
                        disabled={saving}
                        className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="TRIAL">TRIAL</option>
                        <option value="DISABLED">DISABLED</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Override until (date)</label>
                      <input
                        type="date"
                        value={manualOverrideUntil}
                        onChange={(e) => setManualOverrideUntil(e.target.value)}
                        disabled={saving}
                        className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Notes</label>
                      <textarea
                        value={manualOverrideNotes}
                        onChange={(e) => setManualOverrideNotes(e.target.value)}
                        disabled={saving}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-gray-300 py-2 px-3 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true)
                        try {
                          const r = await fetch(`/api/super-admin/companies/${companyId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              status: manualOverrideStatus || null,
                              renewalDate: manualOverrideUntil ? new Date(manualOverrideUntil).toISOString() : null,
                              notes: manualOverrideNotes || null,
                            }),
                          })
                          const data = await r.json()
                          if (data.error) throw new Error(data.error)
                          setCompany((prev) => (prev ? { ...prev, ...data } : data))
                          refetchBillingDebug()
                        } catch (e) {
                          console.error(e)
                        } finally {
                          setSaving(false)
                        }
                      }}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save (audited)"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
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
