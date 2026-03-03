import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  mode: z.enum(["RESET", "EXTEND"]),
  days: z.number().int().optional(),
})

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_EXTEND_DAYS = 365

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const { createSuperAdminAuditLog } = await import("@/lib/audit")
    const { stripe } = await import("@/lib/stripe")

    const check = await requireSuperAdmin()
    if ("error" in check) return check.error
    const actorId = check.id

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { mode } = parsed.data
    let { days } = parsed.data
    const { tenantId } = await params

    const company = await prisma.company.findUnique({
      where: { id: tenantId },
    })
    if (!company) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    }

    const now = new Date()
    const previousTrialEndsAt = company.trialEndsAt ?? null
    let newTrialStartsAt = company.trialStartsAt ?? null
    let newTrialEndsAt = company.trialEndsAt ?? null

    if (mode === "RESET") {
      newTrialStartsAt = now
      newTrialEndsAt = new Date(now.getTime() + 30 * MS_PER_DAY)
    } else {
      days = days ?? 0
      if (!days || days <= 0) {
        return NextResponse.json(
          { error: "Days must be a positive integer for EXTEND." },
          { status: 400 }
        )
      }
      if (days > MAX_EXTEND_DAYS) {
        return NextResponse.json(
          { error: `Extension cannot exceed ${MAX_EXTEND_DAYS} days.` },
          { status: 400 }
        )
      }
      const base = newTrialEndsAt ?? now
      newTrialEndsAt = new Date(base.getTime() + days * MS_PER_DAY)
    }

    if (!newTrialEndsAt) {
      return NextResponse.json(
        { error: "Unable to compute new trial end date." },
        { status: 400 }
      )
    }

    const updateData: {
      trialStartsAt: Date | null
      trialEndsAt: Date
      trialResetCount: { increment: number }
      lastTrialResetAt: Date
      status?: "TRIAL"
    } = {
      trialStartsAt: newTrialStartsAt ?? null,
      trialEndsAt: newTrialEndsAt,
      trialResetCount: { increment: 1 },
      lastTrialResetAt: now,
    }

    // If there's no active Stripe subscription, keep company.status as TRIAL.
    const hasStripeSub = !!company.stripeSubscriptionId
    const stripeStatus = company.subscriptionStatus ?? null
    const isStripeTrialing = stripeStatus === "trialing"

    if (!hasStripeSub || isStripeTrialing) {
      updateData.status = "TRIAL"
    }

    // Optionally sync Stripe trial_end when subscription is still trialing
    if (stripe && hasStripeSub && isStripeTrialing) {
      try {
        const trialEndUnix = Math.floor(newTrialEndsAt.getTime() / 1000)
        await stripe.subscriptions.update(company.stripeSubscriptionId!, {
          trial_end: trialEndUnix,
          proration_behavior: "none",
        })
      } catch (err) {
        console.error("Failed to update Stripe trial_end:", err)
      }
    }

    const updated = await prisma.company.update({
      where: { id: tenantId },
      data: updateData,
    })

    await createSuperAdminAuditLog(
      actorId,
      "TRIAL_RESET",
      {
        tenantId,
        mode,
        days: mode === "EXTEND" ? days : undefined,
        previousTrialEndsAt: previousTrialEndsAt?.toISOString() ?? null,
        newTrialEndsAt: newTrialEndsAt.toISOString(),
        performedBy: {
          id: actorId,
          email: check.email,
        },
      },
      tenantId,
      "TENANT",
      tenantId
    )

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("POST /api/super-admin/tenants/[tenantId]/trial-reset error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to reset trial" },
      { status: 500 }
    )
  }
}

