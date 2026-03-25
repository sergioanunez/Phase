import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * POST /api/settings/work-items/order/reset
 * Admin-only. Recomputes sequenceOrder from category + item positions (keeps structure, refreshes Flow order).
 */
export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantAdmin } = await import("@/lib/rbac")
    const { recomputeGlobalSequenceForCompany } = await import("@/lib/work-template-sequence")
    const ctx = await requireTenantAdmin()

    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)

    const count = await prisma.workTemplateItem.count({ where: { companyId: ctx.companyId } })

    return NextResponse.json({ ok: true, updated: count })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
