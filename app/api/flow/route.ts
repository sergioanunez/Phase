import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { requireTenantContext } from "@/lib/tenant"
import { computeFlow } from "@/lib/flow/computeFlow"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()

    const { searchParams } = new URL(request.url)
    // Scope is now always \"today\" – Flow is a single daily action list.
    const scope = "today" as const
    const filter = (searchParams.get("filter") ?? "all") as "all" | "prep" | "execute"
    const search = searchParams.get("search") ?? undefined

    if (!["Admin", "Manager", "Superintendent"].includes(ctx.role)) {
      return NextResponse.json(
        { error: "Flow is available only for Admin, Manager, and Superintendent." },
        { status: 403 }
      )
    }

    const result = await computeFlow({
      companyId: ctx.companyId,
      userId: ctx.userId,
      role: ctx.role,
      scope,
      filter,
      search,
    })

    return NextResponse.json({
      actions: result.actions,
      circularWarning: result.circularWarning,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
