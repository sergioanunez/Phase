"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { X } from "lucide-react"

type BillingStatus = {
  tenantId: string
  subscriptionStatus: string | null
  trialActive: boolean
  remainingTrialDays: number | null
  activeHomesCount: number
  canRestoreTrial?: boolean
}

export function TrialBanner() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!pathname) return
    if (pathname.startsWith("/auth") || pathname === "/" || pathname === "/contact") return
    if (pathname.startsWith("/super-admin")) {
      setBilling(null)
      return
    }
    if (status !== "authenticated") return
    if (!session?.user || (session.user as { role?: string }).role === "SUPER_ADMIN") return

    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        const state: BillingStatus = {
          tenantId: data.tenantId,
          subscriptionStatus: data.subscriptionStatus ?? null,
          trialActive: !!data.trialActive,
          remainingTrialDays:
            typeof data.remainingTrialDays === "number" ? data.remainingTrialDays : null,
          activeHomesCount: data.activeHomesCount ?? 0,
          canRestoreTrial: !!data.canRestoreTrial,
        }
        const dismissKey = `trial-banner-dismissed:${state.tenantId}`
        const dismissedRaw =
          typeof window !== "undefined" ? window.localStorage.getItem(dismissKey) : null
        if (dismissedRaw) {
          const ts = Number(dismissedRaw)
          if (!Number.isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000) {
            setHidden(true)
          }
        }
        setBilling(state)
      })
      .catch(() => {
        // ignore errors
      })
  }, [pathname, status, session])

  const showRestoreTrial =
    pathname &&
    !pathname.startsWith("/super-admin") &&
    (session?.user as { role?: string } | undefined)?.role !== "SUPER_ADMIN" &&
    !hidden &&
    billing &&
    billing.canRestoreTrial

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

  if (
    !pathname ||
    pathname.startsWith("/super-admin") ||
    (session?.user as { role?: string } | undefined)?.role === "SUPER_ADMIN" ||
    hidden ||
    !billing ||
    billing.subscriptionStatus !== "trialing" ||
    !billing.trialActive ||
    billing.remainingTrialDays == null
  ) {
    return null
  }

  const { remainingTrialDays, activeHomesCount, tenantId } = billing
  const urgent = remainingTrialDays <= 7

  const handleDismiss = () => {
    setHidden(true)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`trial-banner-dismissed:${tenantId}`, String(Date.now()))
    }
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
            Trial
          </span>
          <span>
            <span className="font-medium">
              {remainingTrialDays} day{remainingTrialDays === 1 ? "" : "s"} left
            </span>
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
            onClick={() => router.push("/admin/billing")}
          >
            Choose plan
          </button>
          <button
            type="button"
            className="rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold text-primary hover:underline"
            onClick={() => router.push("/#pricing")}
          >
            View pricing
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

