import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * POST /api/settings/work-items/order/reset
 * Admin-only. Clears sequenceOrder for all tenant templates (fallback ordering applies).
 */
export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantAdmin } = await import("@/lib/rbac")
    const ctx = await requireTenantAdmin()

    const result = await prisma.workTemplateItem.updateMany({
      where: { companyId: ctx.companyId },
      data: { sequenceOrder: null },
    })

    return NextResponse.json({ ok: true, updated: result.count })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
