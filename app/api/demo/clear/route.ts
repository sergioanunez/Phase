import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireTenantContext } = await import("@/lib/tenant")
    const { prisma } = await import("@/lib/prisma")
    const { clearDemoDataForCompany } = await import("@/lib/demo/clear-demo-data")

    const ctx = await requireTenantContext()
    if (!["Admin", "Manager"].includes(ctx.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const result = await prisma.$transaction(async (tx) =>
      clearDemoDataForCompany(tx, ctx.companyId)
    )

    if (result.alreadyCleared) {
      return NextResponse.json(
        { error: "Demo data was already cleared for this workspace." },
        { status: 400 }
      )
    }

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        companyId: ctx.companyId,
        action: "DEMO_DATA_CLEARED",
        metaJson: { cleared: true },
      },
    })

    return NextResponse.json({ success: true, redirectTo: "/homes" })
  } catch (error) {
    return handleApiError(error)
  }
}
