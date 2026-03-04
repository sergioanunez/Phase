"use client"

import { useEffect, useState, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { SettingsNav } from "@/components/settings-nav"
import { CreditCard, Loader2, ExternalLink, FileText, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  recommendPlan,
  getPlanLimit,
  getRecommendedPlanReason,
  PLAN_LABELS,
  type BillingPlanKey,
} from "@/lib/billing/recommendation"

const BILLING_PATH = "/admin/billing"

type Usage = {
  activeHomesCount: number
  usersCount: number
  maxActiveHomes: number | null
  maxUsers: number | null
}

type Trial = {
  trialEndsAt: string | null
  remainingTrialDays: number | null
  trialActive: boolean
  trialExpired: boolean
}

type Subscription = {
  hasCustomer: boolean
  subscriptionStatus: string | null
  planKey: string | null
  currentPeriodEnd: string | null
  companyStatus: string
  pricingTier?: string | null
  whiteLabelEnabled?: boolean
}

type Plan = {
  planKey: string
  label: string
  priceLabel: string
  maxActiveHomes: number | null
  maxUsers: number | null
  whiteLabelEnabled: boolean
  stripePriceId: string | null
}

type BillingData = {
  subscription: Subscription | null
  trial?: Trial
  usage: Usage
  plans: Plan[]
  error?: string
}

const PLAN_ORDER: BillingPlanKey[] = ["starter", "growth", "scale"]

export default function AdminBillingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checkoutPlanKey, setCheckoutPlanKey] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [impersonationRole, setImpersonationRole] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/super-admin/impersonation/context")
      .then((res) => res.json())
      .then((data) => setImpersonationRole(data.active && data.role ? data.role : null))
      .catch(() => setImpersonationRole(null))
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
      return
    }
    if (status !== "authenticated") return

    setLoadError(null)
    const justSuccess = searchParams.get("success") === "1"
    const loadBilling = () =>
      fetch("/api/billing", { credentials: "same-origin" })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(json.error || `Failed to load billing (${res.status})`)
          }
          return json
        })
        .then(setData)
        .catch((err) => {
          setData(null)
          setLoadError(err instanceof Error ? err.message : "Unable to load billing. Try again later.")
        })
        .finally(() => setLoading(false))

    if (justSuccess) {
      fetch("/api/billing/sync", { method: "POST", credentials: "same-origin" })
        .then(() => loadBilling())
        .catch(() => loadBilling())
    } else {
      loadBilling()
    }
  }, [status, router, searchParams])

  const handleSubscribe = async (planKey: string) => {
    setError(null)
    setCheckoutPlanKey(planKey)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
        credentials: "same-origin",
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Checkout failed")
        return
      }
      if (json.url) window.location.href = json.url
      else setError("No checkout URL returned")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed")
    } finally {
      setCheckoutPlanKey(null)
    }
  }

  const handleManageBilling = async () => {
    setError(null)
    setPortalLoading(true)
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "same-origin",
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Failed to open portal")
        return
      }
      if (json.url) window.location.href = json.url
      else setError("No portal URL returned")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portal failed")
    } finally {
      setPortalLoading(false)
    }
  }

  const success = searchParams.get("success") === "1"
  const canceled = searchParams.get("canceled") === "1"
  const highlightPlanKey = searchParams.get("highlight") ?? null
  const plansSectionRef = useRef<HTMLDivElement>(null)
  const usage = data?.usage
  const subscription = data?.subscription
  const trial = data?.trial ?? { trialEndsAt: null, remainingTrialDays: null, trialActive: false, trialExpired: false }
  const plans = data?.plans ?? []
  const currentPlanKey = (subscription?.planKey?.toLowerCase() ?? null) as BillingPlanKey | null
  const activeHomes = usage?.activeHomesCount ?? 0
  const planLimit = getPlanLimit(currentPlanKey)
  const recommendedPlanKey = usage != null ? recommendPlan(usage.activeHomesCount) : null
  const recommendedReason = currentPlanKey && recommendedPlanKey && usage
    ? getRecommendedPlanReason(recommendedPlanKey, usage.activeHomesCount, currentPlanKey)
    : null
  const isOverLimit = planLimit != null && activeHomes > planLimit
  const isNearLimit = planLimit != null && planLimit > 0 && activeHomes >= planLimit * 0.8 && !isOverLimit
  const subscriptionActive = subscription?.subscriptionStatus === "active"
  const whiteLabelEnabled = subscription?.whiteLabelEnabled ?? false

  useEffect(() => {
    if (!highlightPlanKey || !plansSectionRef.current || !data?.plans?.length) return
    const el = document.getElementById(`plan-card-${highlightPlanKey}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlightPlanKey, data?.plans?.length])

  if (status === "loading" || !session?.user) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 flex items-center justify-center">
        <div className="text-center text-muted-foreground">Loading…</div>
      </div>
    )
  }

  const effectiveRole = impersonationRole ?? session.user.role
  if (effectiveRole === "SUPER_ADMIN" || effectiveRole === "Subcontractor") {
    return (
      <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 flex items-center justify-center">
        <div className="text-center text-muted-foreground">Billing is available for account admins.</div>
        <Navigation />
      </div>
    )
  }

  const planLabel = currentPlanKey ? (PLAN_LABELS[currentPlanKey] ?? currentPlanKey) : null

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1.5 mb-4 text-sm text-muted-foreground">
          Manage subdivisions, homes, work templates, contractors, users, and billing. Settings access required.
        </p>
        <div className="mb-6">
          <SettingsNav />
        </div>

        <header className="mb-6">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Billing
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Manage your plan and usage. All features included. No per-seat pricing.
          </p>
        </header>

        {success && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Subscription started. You can manage it below.
          </div>
        )}
        {canceled && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Checkout was canceled.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="text-muted-foreground">Loading…</div>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {data.error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">{data.error}</p>
              </div>
            )}

            {/* Trial active card */}
            {trial.trialActive && !subscriptionActive && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-blue-900">Trial active</h3>
                  <p className="mt-1 text-sm text-blue-800">
                    Trial ends: {trial.trialEndsAt ? new Date(trial.trialEndsAt).toLocaleDateString() : "—"}
                    {trial.remainingTrialDays != null && ` · Days left: ${trial.remainingTrialDays}`}
                  </p>
                  <p className="mt-2 text-sm text-blue-800">
                    Access continues after trial ends, but creating new schedules, punchlists, and tasks is locked until you subscribe.
                  </p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => plansSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Choose a plan
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Action required (trial expired, no subscription) */}
            {trial.trialExpired && !subscriptionActive && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-amber-900">Action required</h3>
                  <p className="mt-1 text-sm text-amber-800">
                    Subscribe to continue creating work.
                  </p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => plansSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Subscribe to continue creating work
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Subscription not active warning (e.g. past_due) */}
            {subscription && subscription.companyStatus !== "ACTIVE" && subscription.companyStatus !== "TRIAL" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  Your subscription is not active. Some features may be limited until billing is updated.{" "}
                  <Link href={BILLING_PATH} className="font-medium underline">Manage billing</Link>
                </p>
              </div>
            )}

            {/* Summary card: plan + usage + add-ons */}
            <Card>
              <CardContent className="p-5 space-y-4">
                {/* Row 1: Subscription + trial chip */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {currentPlanKey ? (PLAN_LABELS[currentPlanKey] ?? currentPlanKey) : "No active subscription"}
                  </span>
                  {trial.trialActive && !subscriptionActive && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      Trial
                    </span>
                  )}
                  {subscription?.currentPeriodEnd && subscriptionActive && (
                    <span className="text-sm text-muted-foreground">
                      Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Row 2: Active homes + limit + progress */}
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">Homes in production</span>
                    <div className="flex items-center gap-2">
                      {isOverLimit && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          Over limit
                        </span>
                      )}
                      <span className="text-sm tabular-nums text-foreground">
                        {activeHomes} active home{activeHomes !== 1 ? "s" : ""}
                        {planLimit != null ? ` / ${planLimit} limit` : ""}
                      </span>
                    </div>
                  </div>
                  {planLimit != null && (
                    <div className="mt-2">
                      <div
                        className="h-2 w-full rounded-full bg-gray-200 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={Math.min(100, (activeHomes / planLimit) * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] ${
                            isOverLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-primary"
                          }`}
                          style={{
                            width: `${Math.min(100, (activeHomes / planLimit) * 100)}%`,
                          }}
                        />
                      </div>
                      {isOverLimit && planLabel && (
                        <p className="mt-1.5 text-sm text-red-600">
                          You&apos;re over the {planLabel} limit. Close completed homes or upgrade.
                        </p>
                      )}
                      {isNearLimit && !isOverLimit && planLabel && (
                        <p className="mt-1.5 text-sm text-amber-700">
                          You&apos;re nearing the {planLabel} limit.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Row 3: Add-ons summary */}
                <div className="text-sm text-muted-foreground">
                  White Label: {whiteLabelEnabled ? "Enabled" : "Not enabled"}
                </div>

                {/* Billing actions */}
                {subscription?.hasCustomer && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    <Button variant="outline" size="sm" onClick={handleManageBilling} disabled={portalLoading}>
                      {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                      Manage billing
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleManageBilling} disabled={portalLoading}>
                      <FileText className="h-4 w-4 mr-2" />
                      View invoices
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Plans */}
            <section ref={plansSectionRef}>
              <p className="text-sm text-muted-foreground mb-3">
                All features included. No per-seat pricing. Upgrade only when you grow.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => {
                  const planKey = plan.planKey.toLowerCase() as BillingPlanKey
                  const isCurrent = currentPlanKey === planKey
                  const isRecommended = recommendedPlanKey === planKey && !isCurrent
                  const currentIdx = currentPlanKey ? PLAN_ORDER.indexOf(currentPlanKey) : -1
                  const thisIdx = PLAN_ORDER.indexOf(planKey)
                  const isUpgrade = currentIdx >= 0 && thisIdx > currentIdx
                  const isDowngrade = currentIdx >= 0 && thisIdx < currentIdx
                  const canSubscribe = !!plan.stripePriceId
                  const buttonLabel = isCurrent
                    ? "Current plan"
                    : isUpgrade
                      ? `Upgrade to ${plan.label}`
                      : isDowngrade
                        ? `Downgrade to ${plan.label}`
                        : `Subscribe to ${plan.label}`
                  const showReason = isRecommended && recommendedReason

                  return (
                    <div
                      key={plan.planKey}
                      id={`plan-card-${plan.planKey}`}
                      className={`rounded-xl border bg-white p-5 flex flex-col ${highlightPlanKey === plan.planKey ? "border-primary ring-2 ring-primary/20" : "border-gray-200"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{plan.label}</span>
                        {isRecommended && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="text-lg font-semibold text-primary mt-1">{plan.priceLabel}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {plan.maxActiveHomes == null ? "Unlimited active homes" : `${plan.maxActiveHomes} active homes`}
                      </div>
                      {showReason && (
                        <p className="mt-2 text-xs text-muted-foreground">{recommendedReason}</p>
                      )}
                      <div className="mt-4 flex-1 flex items-end">
                        {canSubscribe ? (
                          <Button
                            size="sm"
                            variant={isCurrent ? "secondary" : isDowngrade ? "outline" : "default"}
                            className="w-full"
                            onClick={() => handleSubscribe(plan.planKey)}
                            disabled={isCurrent || checkoutPlanKey !== null}
                          >
                            {checkoutPlanKey === plan.planKey ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              buttonLabel
                            )}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full" disabled>
                            {buttonLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Add-ons */}
            <section>
              <h3 className="text-sm font-medium text-foreground mb-3">Add-ons</h3>
              <Card>
                <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <Palette className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">White Label</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          +$99/mo
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Show your logo on login + in-app header and use your brand color belt.
                      </p>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${whiteLabelEnabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                        {whiteLabelEnabled ? "Enabled" : "Not enabled"}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {whiteLabelEnabled ? (
                      <Link href="/admin?tab=white-label">
                        <Button variant="outline" size="sm">Manage in White Label settings</Button>
                      </Link>
                    ) : (
                      <Link href="/admin?tab=white-label">
                        <Button variant="outline" size="sm">Enable White Label</Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <p className="text-muted-foreground">{loadError || "Unable to load billing. Try again later."}</p>
          </div>
        )}
      </div>
      <Navigation />
    </div>
  )
}
