import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { TaskStatus } from "@prisma/client"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { createActivityEvent } from "@/lib/activity"
import { buildBatchSchedulePreview } from "@/lib/homes/batch-generate-schedule"
import {
  computeTasksFingerprint,
  proposalsToScheduledDates,
} from "@/lib/homes/generate-schedule"
import {
  assertHomeScheduleAccess,
  loadTemplateDepsForHome,
  mapTasksForScheduleGeneration,
} from "@/lib/homes/generate-schedule-data"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  homeIds: z.array(z.string().min(1)).min(1).max(200),
  baseAnchorDate: z
    .string()
    .min(1)
    .refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v), "Invalid anchor date"),
  staggerWorkingDays: z.number().int().min(0).max(365).default(0),
  mode: z.enum(["critical", "all"]),
  respectExistingScheduledDates: z.boolean().default(true),
  category: z.string().min(1).nullable().optional(),
  /** Per-home fingerprints from preview; stale homes are skipped with a report. */
  fingerprints: z.record(z.string(), z.string()).optional(),
})

/**
 * POST /api/subdivisions/[id]/generate-schedules/apply
 * Recompute per-home previews and persist. Partial success reporting (not all-or-nothing).
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
      const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import(
        "@/lib/billing/entitlements"
      )
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

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const subdivision = await prisma.subdivision.findFirst({
      where: { id: params.id, companyId: ctx.companyId! },
      select: { id: true, name: true, companyId: true },
    })
    if (!subdivision) {
      return NextResponse.json({ error: "Subdivision not found" }, { status: 404 })
    }

    const uniqueIds = [...new Set(parsed.data.homeIds)]
    const homes = await prisma.home.findMany({
      where: {
        id: { in: uniqueIds },
        subdivisionId: subdivision.id,
        OR: [
          { companyId: ctx.companyId! },
          { companyId: null, subdivision: { companyId: ctx.companyId! } },
        ],
      },
      select: {
        id: true,
        addressOrLot: true,
        startDate: true,
        companyId: true,
        tasks: {
          orderBy: [...homeTaskOrderByTemplateSequence()],
          select: {
            id: true,
            templateItemId: true,
            nameSnapshot: true,
            durationDaysSnapshot: true,
            status: true,
            scheduledDate: true,
            completedAt: true,
            isCriticalPath: true,
            templateItem: {
              select: { optionalCategory: true, isCriticalGate: true },
            },
            contractor: { select: { companyName: true } },
          },
        },
      },
    })

    if (homes.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more homes were not found in this subdivision." },
        { status: 400 }
      )
    }

    for (const home of homes) {
      const allowed = await assertHomeScheduleAccess(
        prisma,
        home.id,
        ctx.userId,
        ctx.role
      )
      if (!allowed) {
        return NextResponse.json(
          { error: `Forbidden: no access to ${home.addressOrLot}` },
          { status: 403 }
        )
      }
    }

    const homeById = new Map(homes.map((h) => [h.id, h]))
    const ordered = uniqueIds.map((id) => homeById.get(id)!).filter(Boolean)
    const templateDeps = await loadTemplateDepsForHome(
      prisma,
      subdivision.companyId ?? ctx.companyId
    )
    const baseAnchor = new Date(
      parsed.data.baseAnchorDate.includes("T")
        ? parsed.data.baseAnchorDate
        : `${parsed.data.baseAnchorDate}T12:00:00`
    )

    const batch = buildBatchSchedulePreview({
      housesInOrder: ordered.map((h) => ({
        homeId: h.id,
        addressOrLot: h.addressOrLot,
        startDate: h.startDate,
        tasks: mapTasksForScheduleGeneration(h.tasks),
      })),
      templateDeps,
      baseAnchorDate: baseAnchor,
      staggerWorkingDays: parsed.data.staggerWorkingDays,
      mode: parsed.data.mode,
      respectExistingScheduledDates: parsed.data.respectExistingScheduledDates,
      category: parsed.data.category ?? null,
    })

    const actorName =
      (await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }))
        ?.name ?? null

    const results: Array<{
      homeId: string
      addressOrLot: string
      status: "applied" | "stale" | "skipped" | "error"
      tasksUpdated: number
      message?: string
    }> = []

    let appliedHomes = 0
    let tasksUpdatedTotal = 0

    for (const house of batch.homes) {
      const dbHome = homeById.get(house.homeId)!
      const tasks = mapTasksForScheduleGeneration(dbHome.tasks)
      const currentFp = computeTasksFingerprint(tasks)
      const expectedFp = parsed.data.fingerprints?.[house.homeId]

      if (expectedFp && expectedFp !== currentFp) {
        results.push({
          homeId: house.homeId,
          addressOrLot: house.addressOrLot,
          status: "stale",
          tasksUpdated: 0,
          message: "Schedule changed since preview. Regenerate preview and try again.",
        })
        continue
      }

      if (house.preview.sourceFingerprint !== currentFp) {
        results.push({
          homeId: house.homeId,
          addressOrLot: house.addressOrLot,
          status: "stale",
          tasksUpdated: 0,
          message: "Schedule changed since preview. Regenerate preview and try again.",
        })
        continue
      }

      const proposals = proposalsToScheduledDates(house.preview)
      if (proposals.length === 0) {
        results.push({
          homeId: house.homeId,
          addressOrLot: house.addressOrLot,
          status: "skipped",
          tasksUpdated: 0,
          message: house.preview.error ?? "No tasks to apply.",
        })
        continue
      }

      try {
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
        await computeHomeForecastAndPersist(house.homeId)

        await createActivityEvent({
          companyId: ctx.companyId!,
          homeId: house.homeId,
          eventType: "task_scheduled",
          title: "Batch generated schedule applied",
          description: `${proposals.length} task(s) updated · ${batch.categoryLabel} · ${batch.modeLabel}`,
          actorName,
          metadata: {
            kind: "batch_schedule_generated_applied",
            mode: batch.mode,
            category: batch.category,
            staggerWorkingDays: batch.staggerWorkingDays,
            respectExistingScheduledDates: batch.respectExistingScheduledDates,
            tasksUpdated: proposals.length,
            anchorDate: house.anchorDate,
            userId: ctx.userId,
          },
        })

        appliedHomes++
        tasksUpdatedTotal += proposals.length
        results.push({
          homeId: house.homeId,
          addressOrLot: house.addressOrLot,
          status: "applied",
          tasksUpdated: proposals.length,
        })
      } catch (err) {
        results.push({
          homeId: house.homeId,
          addressOrLot: house.addressOrLot,
          status: "error",
          tasksUpdated: 0,
          message: err instanceof Error ? err.message : "Failed to apply",
        })
      }
    }

    return NextResponse.json({
      success: appliedHomes > 0,
      appliedHomes,
      houseCount: batch.houseCount,
      tasksUpdated: tasksUpdatedTotal,
      staggerWorkingDays: batch.staggerWorkingDays,
      categoryLabel: batch.categoryLabel,
      modeLabel: batch.modeLabel,
      results,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
