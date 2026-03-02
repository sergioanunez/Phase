"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { X } from "lucide-react"
import { useBillingStatus } from "@/lib/billing/useBillingStatus"
import { getTrialBannerMiddleText } from "@/lib/billing/trial-copy"

export function TrialBanner() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const { billing, error: billingError } = useBillingStatus()
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!billing?.tenantId) return
    const dismissKey = `trial-banner-dismissed:${billing.tenantId}`
    const dismissedRaw =
      typeof window !== "undefined" ? window.localStorage.getItem(dismissKey) : null
    if (dismissedRaw) {
      const ts = Number(dismissedRaw)
      if (!Number.isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000) {
        setHidden(true)
      }
    }
  }, [billing?.tenantId])

  const showRestoreTrial =
    pathname &&
    !pathname.startsWith("/super-admin") &&
    (session?.user as { role?: string } | undefined)?.role !== "SUPER_ADMIN" &&
    !hidden &&
    billing &&
    billing.canRestoreTrial

  const showBillingError =
    pathname &&
    !pathname.startsWith("/super-admin") &&
    (session?.user as { role?: string } | undefined)?.role !== "SUPER_ADMIN" &&
    !hidden &&
    billingError &&
    !billing

  const showTrialBanner =
    pathname &&
    !pathname.startsWith("/super-admin") &&
    (session?.user as { role?: string } | undefined)?.role !== "SUPER_ADMIN" &&
    !hidden &&
    billing &&
    ((billing.isTrialing && !billing.trialExpired) || (billing.trialExpired && !billing.subscriptionActive))

  if (showRestoreTrial) {
    const handleRestoreTrial = async () => {
      try {
        const res = await fetch("/api/trial/ensure-trial", { method: "POST", credentials: "same-origin" })
        if (res.ok) window.location.reload()
      } catch {
        // ignore
      }
    }
    return (
      <div className="border-b border-amber-200 bg-amber-50 text-sm text-slate-800">
        <div className="app-header-nav-width mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 md:px-8">
          <span>Signed up for a free trial but don&apos;t see it?</span>
          <button
            type="button"
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
            onClick={handleRestoreTrial}
          >
            Restore trial status
          </button>
        </div>
      </div>
    )
  }

  if (showBillingError) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 text-sm text-slate-800">
        <div className="app-header-nav-width mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 md:px-8">
          <span>Your account may not be linked to a company yet.</span>
          <div className="flex gap-2">
            <a href="/start-trial" className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700">
              Start free trial
            </a>
            <button
              type="button"
              className="rounded-md border border-amber-600 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              onClick={async () => {
                try {
                  const res = await fetch("/api/trial/ensure-trial", { method: "POST", credentials: "same-origin" })
                  if (res.ok) window.location.reload()
                } catch {
                  // ignore
                }
              }}
            >
              Restore trial
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!showTrialBanner || !billing) return null

  const { daysRemaining, trialExpired, activeHomesCount, tenantId, recommendedPlanKey } = billing
  const dynamicMiddle = getTrialBannerMiddleText(daysRemaining, trialExpired)
  const ctaLabel = trialExpired && !billing.subscriptionActive ? "Upgrade" : "View plan"
  const highlight = recommendedPlanKey ? `?highlight=${encodeURIComponent(recommendedPlanKey)}` : ""
  const urgent = (daysRemaining ?? 0) <= 7 || trialExpired

  const handleDismiss = () => {
    setHidden(true)
    if (typeof window !== "undefined" && tenantId) {
      window.localStorage.setItem(`trial-banner-dismissed:${tenantId}`, String(Date.now()))
    }
  }

  const handleCta = () => {
    router.push(`/admin/billing${highlight}`)
  }

  return (
    <div
      className={`border-b ${
        urgent ? "bg-amber-100 border-amber-300" : "bg-sky-50 border-sky-200"
      } text-sm text-slate-800`}
    >
      <div className="app-header-nav-width mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
            TRIAL
          </span>
          <span>
            <span className="font-medium">{dynamicMiddle}</span>
            {activeHomesCount > 0 && (
              <span className="ml-2 text-slate-700">
                · {activeHomesCount} active home{activeHomesCount === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            onClick={handleCta}
          >
            {ctaLabel}
          </button>
          <button
            type="button"
            className="ml-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200/70"
            onClick={handleDismiss}
          >
            <X className="mr-1 h-3 w-3" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

