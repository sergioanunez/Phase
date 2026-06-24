import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { TASK_STATUS_NOT_APPLICABLE } from "@/lib/task-status"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** POST /api/tasks/[id]/mark-applicable — revert a not-applicable task back to active work. */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { hasPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const { createTaskMarkedApplicableEvent } = await import("@/lib/activity")
    const { recalculateHomeCompletion } = await import("@/lib/home-completion")

    const ctx = await requireTenantContext()
    if (!hasPermission(ctx.role, "tasks:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const before = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
      },
      include: {
        home: { select: { id: true, addressOrLot: true, companyId: true } },
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    if (before.status !== TASK_STATUS_NOT_APPLICABLE) {
      return NextResponse.json({ error: "Task is not marked not applicable" }, { status: 400 })
    }

    const restoreStatus = before.statusBeforeNotApplicable ?? "Unscheduled"
    const companyId = before.companyId ?? before.home.companyId

    const after = await prisma.homeTask.update({
      where: { id: params.id },
      data: {
        status: restoreStatus,
        statusBeforeNotApplicable: null,
        notApplicableReason: null,
        notApplicableNote: null,
        notApplicableAt: null,
        notApplicableByUserId: null,
      },
      include: {
        home: { include: { subdivision: true } },
        contractor: true,
        templateItem: true,
        lastRescheduledBy: { select: { id: true, name: true } },
        reportedCompleteBy: { select: { id: true, name: true } },
        notApplicableBy: { select: { id: true, name: true } },
      },
    })

    await createAuditLog(
      ctx.userId,
      "HomeTask",
      params.id,
      "task_marked_applicable",
      before,
      after,
      companyId
    )

    const actor = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    })

    if (!companyId) {
      return NextResponse.json(after)
    }

    await createTaskMarkedApplicableEvent({
      companyId,
      homeId: before.homeId,
      taskId: params.id,
      taskName: before.nameSnapshot,
      restoredStatus: restoreStatus,
      actorName: actor?.name ?? null,
    })

    if (companyId) {
      await recalculateHomeCompletion(prisma, before.homeId, companyId)
    }

    try {
      const { computeHomeForecastAndPersist } = await import("@/lib/forecast")
      await computeHomeForecastAndPersist(before.homeId)
    } catch (err) {
      console.error("[mark-applicable] forecast recompute failed:", err)
    }

    return NextResponse.json(after)
  } catch (error) {
    return handleApiError(error)
  }
}
