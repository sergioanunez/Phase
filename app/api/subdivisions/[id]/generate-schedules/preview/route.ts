import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { buildBatchSchedulePreview } from "@/lib/homes/batch-generate-schedule"
import {
  assertHomeScheduleAccess,
  loadTemplateDepsForHome,
  mapTasksForScheduleGeneration,
} from "@/lib/homes/generate-schedule-data"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"
import { isTaskIncompleteForProgress } from "@/lib/task-status"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  homeIds: z.array(z.string().min(1)).min(1).max(200),
  baseAnchorDate: z
    .string()
    .min(1)
    .refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v), "Invalid anchor date"),
  staggerWorkingDays: z.number().int().min(0).max(365).default(0),
  mode: z.enum(["critical", "all"]).default("critical"),
  respectExistingScheduledDates: z.boolean().default(true),
  category: z.string().min(1).nullable().optional(),
})

function homeStatusLabel(tasks: { status: string }[]): string {
  if (tasks.length === 0) return "No tasks"
  const incomplete = tasks.filter((t) => isTaskIncompleteForProgress(t.status))
  if (incomplete.length === 0) return "Complete"
  const anyScheduled = incomplete.some(
    (t) => t.status !== "Unscheduled" && t.status !== "NotApplicable"
  )
  if (!anyScheduled) return "Not started"
  return "In progress"
}

/**
 * POST /api/subdivisions/[id]/generate-schedules/preview
 * Batch proposed schedules for selected homes (no DB writes).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission, hasPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    if (!hasPermission(ctx.role, "tasks:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
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
        displayOrder: true,
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
    // Preserve client order (session order for stagger); do not reorder by displayOrder.
    const ordered = uniqueIds.map((id) => homeById.get(id)!).filter(Boolean)

    const companyId = subdivision.companyId ?? ctx.companyId
    const templateDeps = await loadTemplateDepsForHome(prisma, companyId)

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
        statusLabel: homeStatusLabel(h.tasks),
      })),
      templateDeps,
      baseAnchorDate: baseAnchor,
      staggerWorkingDays: parsed.data.staggerWorkingDays,
      mode: parsed.data.mode,
      respectExistingScheduledDates: parsed.data.respectExistingScheduledDates,
      category: parsed.data.category ?? null,
    })

    return NextResponse.json({
      ...batch,
      subdivision: { id: subdivision.id, name: subdivision.name },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
