import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * POST /api/templates/claim-orphans
 * Attach all work template items with companyId null to the current user's company.
 */
export async function POST() {
  try {
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
