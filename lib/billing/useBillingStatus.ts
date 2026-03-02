"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import type { BillingPlanKey } from "./recommendation"

export type BillingStatusState = {
  isTrialing: boolean
  trialEndsAt: Date | null
  daysRemaining: number | null
  trialExpired: boolean
  subscriptionActive: boolean
  activeHomesCount: number
  planKey: BillingPlanKey | null
  recommendedPlanKey: BillingPlanKey | null
  recommendedPlanLabel: string | null
  canRestoreTrial: boolean
  tenantId: string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseDaysRemaining(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null
  const now = Date.now()
  const end = trialEndsAt.getTime()
  const ms = end - now
  return Math.max(0, Math.ceil(ms / MS_PER_DAY))
}

export function useBillingStatus(): {
  billing: BillingStatusState | null
  loading: boolean
  error: boolean
} {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [billing, setBilling] = useState<BillingStatusState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!pathname || pathname.startsWith("/auth") || pathname === "/" || pathname === "/contact") {
      setBilling(null)
      setLoading(false)
      setError(false)
      return
    }
    if (pathname.startsWith("/super-admin")) {
      setBilling(null)
      setLoading(false)
      setError(false)
      return
    }
    if (status !== "authenticated" || !session?.user || (session.user as { role?: string }).role === "SUPER_ADMIN") {
      setBilling(null)
      setLoading(false)
      return
    }

    setError(false)
    setLoading(true)
    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403) setError(true)
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (!data) {
          setBilling(null)
          setLoading(false)
          return
        }
        const trialEndsAtRaw = data.trialEndsAt
        const trialEndsAt =
          trialEndsAtRaw != null ? (typeof trialEndsAtRaw === "string" ? new Date(trialEndsAtRaw) : trialEndsAtRaw) : null
        const daysRemaining =
          typeof data.remainingTrialDays === "number"
            ? data.remainingTrialDays
            : parseDaysRemaining(trialEndsAt)
        const subscriptionStatus = data.subscriptionStatus ?? null
        const subscriptionActive = subscriptionStatus === "active"
        const isTrialing = data.trialActive === true || subscriptionStatus === "trialing"
        const trialExpired = Boolean(data.trialExpired)

        const rec = data.recommendedPlan ?? {}
        setBilling({
          isTrialing,
          trialEndsAt,
          daysRemaining,
          trialExpired,
          subscriptionActive,
          activeHomesCount: data.activeHomesCount ?? 0,
          planKey: data.planKey ?? null,
          recommendedPlanKey: rec.planKey ?? null,
          recommendedPlanLabel: rec.recommendedPlanLabel ?? null,
          canRestoreTrial: Boolean(data.canRestoreTrial),
          tenantId: data.tenantId ?? null,
        })
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [pathname, status, session])

  return { billing, loading, error }
}
