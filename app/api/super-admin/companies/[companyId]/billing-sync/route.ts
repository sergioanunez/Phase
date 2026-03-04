import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { stripe } from "@/lib/stripe"
import { syncCompanySubscription } from "@/lib/billing/syncSubscription"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/super-admin/companies/:companyId/billing-sync
 * Syncs this company's Stripe subscription into the DB (same logic as /api/billing/sync). SUPER_ADMIN only. Audited.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const { prisma } = await import("@/lib/prisma")
    const { createSuperAdminAuditLog } = await import("@/lib/audit")
    const check = await requireSuperAdmin()
    if ("error" in check) return check.error
    const actorId = check.id

    const { companyId } = await params
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    })
    if (!company)
      return NextResponse.json({ error: "Company not found" }, { status: 404 })

    if (!stripe) {
      return NextResponse.json({ error: "Billing is not configured" }, { status: 503 })
    }

    const syncedAt = new Date().toISOString()
    const result = await syncCompanySubscription(prisma, companyId)

    await createSuperAdminAuditLog(
      actorId,
      "BILLING_SYNC",
      {
        companyId,
        syncedAt,
        result: result.ok ? "ok" : "error",
        ...(result.ok ? {} : { reason: result.reason, message: result.message }),
      },
      companyId,
      "Company",
      companyId
    )

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        syncedAt,
        debug: { result: "ok" },
      })
    }
    return NextResponse.json(
      {
        ok: false,
        syncedAt,
        debug: { result: "error", reason: result.reason, message: result.message },
        error: result.message ?? result.reason,
      },
      { status: 400 }
    )
  } catch (err) {
    console.error("POST billing-sync error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Billing sync failed" },
      { status: 500 }
    )
  }
}
