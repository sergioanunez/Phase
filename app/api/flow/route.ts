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
      search,
    })

    const attention = result.actions.filter(
      (a) =>
        a.isOverdue ||
        (typeof a.slackWorkingDays === "number" && a.slackWorkingDays < 0)
    )
    const attentionHomeIds = new Set(attention.map((a) => a.homeId))
    const { dispatchWebPushFlowAttention } = await import("@/lib/web-push-dispatch")
    dispatchWebPushFlowAttention({
      companyId: ctx.companyId,
      targetUserId: ctx.userId,
      attentionTaskIds: attention.map((a) => a.taskId),
      attentionHomeCount: attentionHomeIds.size,
    }).catch((err) => console.error("[push] flow attention:", err))

    return NextResponse.json({
      actions: result.actions,
      circularWarning: result.circularWarning,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
