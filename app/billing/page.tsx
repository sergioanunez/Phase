"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { CreditCard, Loader2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

type Usage = {
  activeHomesCount: number
  usersCount: number
  maxActiveHomes: number | null
  maxUsers: number | null
}

type Subscription = {
  hasCustomer: boolean
  subscriptionStatus: string | null
  planKey: string | null
  currentPeriodEnd: string | null
  companyStatus: string
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
  usage: Usage
  plans: Plan[]
  error?: string
}

export default function BillingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checkoutPlanKey, setCheckoutPlanKey] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
      return
    }
    if (status !== "authenticated") return

    setLoadError(null)
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
  }, [status, router])

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

  if (status === "loading" || !session?.user) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 flex items-center justify-center">
        <div className="text-center text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (session.user.role === "SUPER_ADMIN" || session.user.role === "Subcontractor") {
    return (
      <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 flex items-center justify-center">
        <div className="text-center text-muted-foreground">Billing is available for account admins.</div>
        <Navigation />
      </div>
    )
  }

  const usage = data?.usage
  const subscription = data?.subscription
  const plans = data?.plans ?? []

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-7 w-7" />
            Billing
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Manage your plan, usage, and billing. Subscribe or upgrade below; use Manage billing to update payment or cancel.
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
          <div className="space-y-8">
            {data.error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">{data.error}</p>
              </div>
            )}
            {subscription && subscription.companyStatus !== "ACTIVE" && subscription.companyStatus !== "TRIAL" && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  Your subscription is not active. Some features may be limited until billing is updated.{" "}
                  <Link href="/billing" className="font-medium underline">
                    Manage billing
                  </Link>
                </p>
              </section>
            )}
            {/* Current subscription */}
            {subscription && (
              <section className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-sm font-medium text-foreground mb-2">Current plan</h2>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-lg font-semibold">
                    {subscription.planKey
                      ? plans.find((p) => p.planKey === subscription.planKey)?.label ?? subscription.planKey
                      : "No active subscription"}
                  </span>
                  {subscription.subscriptionStatus && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      {subscription.subscriptionStatus}
                    </span>
                  )}
                  {subscription.currentPeriodEnd && (
                    <span className="text-sm text-muted-foreground">
                      Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {subscription.hasCustomer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                  >
                    {portalLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Manage billing
                  </Button>
                )}
              </section>
            )}

            {/* Usage */}
            {usage && (
              <section className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-sm font-medium text-foreground mb-1">Active homes</h2>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {usage.activeHomesCount}
                  {usage.maxActiveHomes == null ? " / Unlimited" : ` / ${usage.maxActiveHomes}`}
                </p>
                {usage.maxActiveHomes != null && (
                  <div className="mt-3">
                    <div
                      className="h-2 w-full rounded-full bg-gray-200 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={
                        usage.maxActiveHomes > 0
                          ? Math.min(100, (usage.activeHomesCount / usage.maxActiveHomes) * 100)
                          : 0
                      }
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{
                          width: `${
                            usage.maxActiveHomes > 0
                              ? Math.min(100, (usage.activeHomesCount / usage.maxActiveHomes) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {usage.maxUsers != null && (
                  <>
                    <h2 className="text-sm font-medium text-foreground mb-1 mt-4">Users</h2>
                    <p className="text-2xl font-semibold tabular-nums">
                      {usage.usersCount}
                      {usage.maxUsers == null ? " / Unlimited" : ` / ${usage.maxUsers}`}
                    </p>
                  </>
                )}
              </section>
            )}

            {/* Plan cards */}
            <section>
              <h2 className="text-sm font-medium text-foreground mb-3">Plans</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => {
                  const isCurrent = subscription?.planKey === plan.planKey
                  const canSubscribe = !!plan.stripePriceId
                  const planOrder = ["starter", "growth", "scale"] as const
                  const currentIdx = subscription?.planKey ? planOrder.indexOf(subscription.planKey as any) : -1
                  const thisIdx = planOrder.indexOf(plan.planKey as any)
                  const isUpgrade = currentIdx >= 0 && thisIdx > currentIdx
                  const buttonLabel = isCurrent
                    ? "Current plan"
                    : isUpgrade
                      ? "Upgrade"
                      : "Subscribe"
                  return (
                    <div
                      key={plan.planKey}
                      className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col"
                    >
                      <div className="font-semibold">{plan.label}</div>
                      <div className="text-lg font-semibold text-primary mt-1">{plan.priceLabel}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {plan.maxActiveHomes == null ? "Unlimited" : `${plan.maxActiveHomes} active homes`}
                        {plan.maxUsers != null && ` · ${plan.maxUsers} users`}
                        {plan.whiteLabelEnabled && " · White label"}
                      </div>
                      <div className="mt-4 flex-1 flex items-end">
                        {canSubscribe ? (
                          <Button
                            size="sm"
                            variant={isCurrent ? "secondary" : "default"}
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
                          <span className="text-xs text-muted-foreground">Contact sales</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <p className="text-sm text-muted-foreground">
              Reached your limit? Complete homes from the schedule so they no longer count as active, or upgrade your plan.
            </p>
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
