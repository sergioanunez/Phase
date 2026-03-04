import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { stripe } from "@/lib/stripe"
import { syncCompanySubscription } from "@/lib/billing/syncSubscription"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/billing/sync
 * Syncs the current tenant's subscription from Stripe into the DB.
 * Call after checkout success redirect so the UI shows the plan even if the webhook hasn't run yet.
 */
export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    if (!stripe) {
      return NextResponse.json({ error: "Billing is not configured" }, { status: 503 })
    }
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("users:write")

    const result = await syncCompanySubscription(prisma, ctx.companyId)
    if (result.ok) return NextResponse.json({ synced: true })
    return NextResponse.json(
      { synced: false, reason: result.reason, error: result.message },
      { status: result.reason === "no_customer" ? 400 : 500 }
    )
  } catch (e) {
    console.error("POST /api/billing/sync error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    )
  }
}
