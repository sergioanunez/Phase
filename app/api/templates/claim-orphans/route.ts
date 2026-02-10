import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * POST /api/templates/claim-orphans
 * Attach all work template items with companyId null to the current user's company.
 */
export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("templates:write")

    const result = await prisma.workTemplateItem.updateMany({
      where: { companyId: null },
      data: { companyId: ctx.companyId },
    })

    if (result.count > 0) {
      await createAuditLog(
        ctx.userId,
        "WorkTemplateItem",
        "claim-orphans",
        "CLAIM_ORPHANS",
        null,
        { count: result.count },
        ctx.companyId
      )
    }

    return NextResponse.json({ claimed: result.count })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
