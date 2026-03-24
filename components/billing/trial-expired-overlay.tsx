"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { AlertTriangle, X } from "lucide-react"

type ExpiredStatus = {
  tenantId: string
  subscriptionStatus: string | null
  trialExpired: boolean
  trialEndsAt: string | null
  activeHomesCount: number
  recommendedPlan: {
    planKey: "starter" | "growth" | "scale"
    maxActiveHomes: number
    pricePerMonth: number
  }
}

export function TrialExpiredOverlay() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [billing, setBilling] = useState<ExpiredStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const overlayDismissKey = billing
    ? `trialExpiredOverlayDismissed:${billing.tenantId}:${billing.trialEndsAt ?? "unknown"}`
    : null

  const dismissOverlay = () => {
    if (!overlayDismissKey) return
    try {
      window.localStorage.setItem(overlayDismissKey, "1")
    } catch {
      // ignore storage errors; overlay still dismisses for this session
    }
    setDismissed(true)
  }

  useEffect(() => {
    if (!pathname) return
    if (
      pathname.startsWith("/auth") ||
      pathname === "/" ||
      pathname === "/contact" ||
      pathname === "/founders10" ||
      pathname.startsWith("/punchlist")
    )
      return
    if (pathname.startsWith("/super-admin")) {
      setBilling(null)
      return
    }
    if (status !== "authenticated" || !session?.user) return
    const role = (session.user as { role?: string }).role
    if (role === "SUPER_ADMIN" || role === "Subcontractor") return

    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        const state: ExpiredStatus = {
          tenantId: data.tenantId,
          subscriptionStatus: data.subscriptionStatus ?? null,
          trialExpired: !!data.trialExpired,
          trialEndsAt: data.trialEndsAt ?? null,
          activeHomesCount: data.activeHomesCount ?? 0,
          recommendedPlan: data.recommendedPlan ?? {
            planKey: "starter",
            maxActiveHomes: 5,
            pricePerMonth: 199,
          },
        }
        setBilling(state)
      })
      .catch(() => {
        // ignore errors; overlay won't render
      })
  }, [pathname, status, session])

  useEffect(() => {
    if (!billing || !overlayDismissKey) return
    try {
      setDismissed(window.localStorage.getItem(overlayDismissKey) === "1")
    } catch {
      setDismissed(false)
    }
  }, [billing, overlayDismissKey])

  if (
    !pathname ||
    pathname.startsWith("/super-admin") ||
    !billing ||
    !billing.trialExpired ||
    dismissed ||
    billing.subscriptionStatus === "active" ||
    !session?.user ||
    (session.user as { role?: string }).role === "SUPER_ADMIN" ||
    (session.user as { role?: string }).role === "Subcontractor"
  ) {
    return null
  }

  const { activeHomesCount, recommendedPlan } = billing

  const planLabel =
    recommendedPlan.planKey === "starter"
      ? "Starter"
      : recommendedPlan.planKey === "growth"
        ? "Growth"
        : "Scale"

  const reduceToStarterNeeded =
    recommendedPlan.planKey !== "starter" && activeHomesCount > 5
  const neededReduction = activeHomesCount > 5 ? activeHomesCount - 5 : 0

  const handleCheckout = async (planKey: "starter" | "growth" | "scale") => {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
        credentials: "same-origin",
      })
      const json = await res.json()
      if (!res.ok || !json.url) return
      window.location.href = json.url
    } catch {
      // let API error surfaces via toast later if needed
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissOverlay()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Trial has ended"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Your trial has ended</h2>
              <p className="text-sm text-muted-foreground">
                View data remains available, but scheduling and other changes are paused until you
                choose a plan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissOverlay}
            aria-label="Close trial overlay"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted/60 active:bg-muted/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <div className="flex justify-between">
            <span>Active homes</span>
            <span className="font-medium">{activeHomesCount}</span>
          </div>
        </div>

        <div className="mb-4 space-y-1 text-sm">
          <p>
            Recommended plan:{" "}
            <span className="font-semibold">
              {planLabel} (${recommendedPlan.pricePerMonth}/month)
            </span>{" "}
            for up to {recommendedPlan.maxActiveHomes === Infinity
              ? "unlimited"
              : `${recommendedPlan.maxActiveHomes}`}{" "}
            active homes.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              onClick={() => handleCheckout(recommendedPlan.planKey)}
            >
              Continue with {planLabel}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                onClick={() => {
                  dismissOverlay()
                  router.push("/admin/billing")
                }}
            >
              View all plans
            </button>
          </div>
          {reduceToStarterNeeded && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline sm:mt-0"
                onClick={() => {
                  dismissOverlay()
                  router.push(
                    `/homes?reduceToStarter=1&activeHomes=${activeHomesCount}&needReduce=${neededReduction}`
                  )
                }}
            >
              Reduce to Starter (5 homes)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

