import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { createActivityEvent } from "@/lib/activity"
import {
  buildSchedulePreview,
  computeDefaultAnchorDate,
  proposalsToScheduledDates,
} from "@/lib/homes/generate-schedule"
import {
  loadHomeForScheduleGeneration,
  loadTemplateDepsForHome,
  mapTasksForScheduleGeneration,
  assertHomeScheduleAccess,
} from "@/lib/homes/generate-schedule-data"
import { TaskStatus } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  anchorDate: z
    .string()
    .min(1)
    .refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v), "Invalid anchor date"),
  mode: z.enum(["critical", "all"]),
})

/**
 * POST /api/homes/[id]/generate-schedule/apply
 * Recompute preview server-side and persist proposed dates to incomplete tasks in scope.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission, hasPermission } = await import("@/lib/rbac")
    const { computeHomeForecastAndPersist } = await import("@/lib/forecast")
    const ctx = await requireTenantPermission("tasks:write")

    if (!hasPermission(ctx.role, "tasks:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (ctx.companyId) {
      const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import("@/lib/billing/entitlements")
      const gates = await getBillingGates(prisma, ctx.companyId)
      if (!gates.canScheduleTasks) {
        return NextResponse.json(
          {
            error: UPGRADE_BODY,
            code: "TRIAL_ENDED",
            upgradeHint: "/admin/billing",
            title: UPGRADE_TITLE,
          },
          { status: 403 }
        )
      }
    }

    const home = await loadHomeForScheduleGeneration(prisma, params.id, ctx.companyId!)
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const allowed = await assertHomeScheduleAccess(prisma, home.id, ctx.userId, ctx.role)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const tasks = mapTasksForScheduleGeneration(home.tasks)
    const templateDeps = await loadTemplateDepsForHome(prisma, home.companyId ?? ctx.companyId)
    const anchorDate = new Date(
      parsed.data.anchorDate.includes("T")
        ? parsed.data.anchorDate
        : `${parsed.data.anchorDate}T12:00:00`
    )

    const preview = buildSchedulePreview({
      home,
      tasks,
      templateDeps,
      anchorDate,
      mode: parsed.data.mode,
    })

    if (preview.error || preview.rows.length === 0) {
      return NextResponse.json(
        { error: preview.error ?? "No tasks to apply." },
        { status: 400 }
      )
    }

    const proposals = proposalsToScheduledDates(preview)
    const taskStatusById = new Map(tasks.map((t) => [t.id, t.status]))

    await prisma.$transaction(
      proposals.map(({ taskId, scheduledDate }) => {
        const currentStatus = taskStatusById.get(taskId)
        const data: { scheduledDate: Date; status?: TaskStatus } = { scheduledDate }
        if (currentStatus === "Unscheduled") {
          data.status = "Scheduled"
        }
        return prisma.homeTask.update({
          where: { id: taskId },
          data,
        })
      })
    )

    await computeHomeForecastAndPersist(home.id)

    const actorName =
      (await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }))?.name ??
      null

    await createActivityEvent({
      companyId: ctx.companyId!,
      homeId: home.id,
      eventType: "task_scheduled",
      title: "Generated schedule applied",
      description: `${preview.proposedCount} task(s) updated · ${preview.modeLabel}`,
      actorName,
      metadata: {
        kind: "schedule_generated_applied",
        mode: preview.mode,
        tasksUpdated: preview.proposedCount,
        anchorDate: preview.anchorDate,
        projectedCompletionDate: preview.proposedCompletionDate,
        userId: ctx.userId,
      },
    })

    return NextResponse.json({
      success: true,
      tasksUpdated: preview.proposedCount,
      projectedCompletionDate: preview.proposedCompletionDate,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
