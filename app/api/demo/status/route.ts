import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireTenantContext } = await import("@/lib/tenant")
    const { prisma } = await import("@/lib/prisma")
    const ctx = await requireTenantContext()

    if (!["Admin", "Manager"].includes(ctx.role)) {
      return NextResponse.json({
        showBanner: false,
        canClearDemo: false,
        demoDataSeeded: false,
        demoDataCleared: false,
      })
    }

    const company = await prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { demoDataSeeded: true, demoDataCleared: true },
    })

    const demoHomeCount = await prisma.home.count({
      where: { companyId: ctx.companyId, isDemo: true },
    })

    const showBanner =
      !!company?.demoDataSeeded &&
      !company.demoDataCleared &&
      demoHomeCount > 0

    return NextResponse.json({
      showBanner,
      canClearDemo: showBanner,
      demoDataSeeded: company?.demoDataSeeded ?? false,
      demoDataCleared: company?.demoDataCleared ?? false,
      demoHomeCount,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
