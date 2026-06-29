import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { TaskStatus } from "@prisma/client"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import {
  isCatchUpDateInFuture,
  isCatchUpEligibleTask,
  parseCatchUpCompletedDate,
} from "@/lib/catch-up-schedule"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"
import { assertHomeScheduleAccess } from "@/lib/homes/generate-schedule-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
  completedAt: z.string().min(1),
})

/**
 * POST /api/homes/[id]/catch-up-schedule
 * Bulk-mark incomplete tasks completed without SMS, reminders, or rescheduling.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission, hasPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const { createCatchUpScheduleEvent } = await import("@/lib/activity")
    const { recalculateHomeCompletion } = await import("@/lib/home-completion")
    const { computeHomeForecastAndPersist } = await import("@/lib/forecast")

    const ctx = await requireTenantPermission("tasks:write")
    if (!hasPermission(ctx.role, "tasks:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (ctx.role !== "Admin" && ctx.role !== "Manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const home = await prisma.home.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, subdivision: { companyId: ctx.companyId } },
        ],
      },
      select: {
        id: true,
        companyId: true,
        addressOrLot: true,
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const allowed = await assertHomeScheduleAccess(prisma, home.id, ctx.userId, ctx.role)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const data = bodySchema.parse(body)
    const completedAt = parseCatchUpCompletedDate(data.completedAt)

    if (isCatchUpDateInFuture(completedAt)) {
      return NextResponse.json(
        { error: "Completion date cannot be in the future." },
        { status: 400 }
      )
    }

    const uniqueIds = [...new Set(data.taskIds)]
    const tasks = await prisma.homeTask.findMany({
      where: {
        homeId: home.id,
        id: { in: uniqueIds },
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
      },
      orderBy: [...homeTaskOrderByTemplateSequence()],
      select: {
        id: true,
        nameSnapshot: true,
        status: true,
        scheduledDate: true,
      },
    })

    if (tasks.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more tasks were not found on this home." },
        { status: 400 }
      )
    }

    const ineligible = tasks.filter((t) => !isCatchUpEligibleTask(t.status))
    if (ineligible.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot catch up completed, canceled, or not-applicable tasks: ${ineligible.map((t) => t.nameSnapshot).join(", ")}`,
        },
        { status: 400 }
      )
    }

    const companyId = home.companyId ?? ctx.companyId
    if (!companyId) {
      return NextResponse.json({ error: "Home has no tenant scope" }, { status: 400 })
    }

    const updated = await prisma.$transaction(
      tasks.map((task) =>
        prisma.homeTask.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.Completed,
            completedAt,
          },
          select: { id: true, nameSnapshot: true, status: true, completedAt: true },
        })
      )
    )

    await createAuditLog(
      ctx.userId,
      "Home",
      home.id,
      "catch_up_schedule",
      { taskIds: uniqueIds },
      { completedCount: updated.length, completedAt: completedAt.toISOString() },
      companyId
    )

    const actor = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    })

    await createCatchUpScheduleEvent({
      companyId,
      homeId: home.id,
      taskCount: updated.length,
      completedAt,
      taskNames: updated.map((t) => t.nameSnapshot),
      actorName: actor?.name ?? null,
    })

    await recalculateHomeCompletion(prisma, home.id, companyId)

    try {
      await computeHomeForecastAndPersist(home.id)
    } catch (err) {
      console.error("[catch-up-schedule] forecast recompute failed:", err)
    }

    return NextResponse.json({
      success: true,
      tasksUpdated: updated.length,
      completedAt: completedAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
