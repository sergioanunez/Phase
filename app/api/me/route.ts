import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireTenantContext } = await import("@/lib/tenant")
    const ctx = await requireTenantContext()

    return NextResponse.json({
      userId: ctx.userId,
      companyId: ctx.companyId,
      companyName: ctx.companyName ?? null,
      role: ctx.role,
      contractorId: ctx.contractorId,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
