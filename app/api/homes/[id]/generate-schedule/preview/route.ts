import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import {
  buildSchedulePreview,
  computeDefaultAnchorDate,
} from "@/lib/homes/generate-schedule"
import {
  loadHomeForScheduleGeneration,
  loadTemplateDepsForHome,
  mapTasksForScheduleGeneration,
  assertHomeScheduleAccess,
} from "@/lib/homes/generate-schedule-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  anchorDate: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}/.test(v), "Invalid anchor date"),
  mode: z.enum(["critical", "all"]).default("critical"),
  respectExistingScheduledDates: z.boolean().default(true),
})

/**
 * POST /api/homes/[id]/generate-schedule/preview
 * Compute proposed schedule without persisting.
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

    const home = await loadHomeForScheduleGeneration(prisma, params.id, ctx.companyId!)
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const allowed = await assertHomeScheduleAccess(prisma, home.id, ctx.userId, ctx.role)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const tasks = mapTasksForScheduleGeneration(home.tasks)
    const templateDeps = await loadTemplateDepsForHome(prisma, home.companyId ?? ctx.companyId)
    const defaultAnchor = computeDefaultAnchorDate(home, tasks)
    const anchorDate = parsed.data.anchorDate
      ? new Date(parsed.data.anchorDate.includes("T") ? parsed.data.anchorDate : `${parsed.data.anchorDate}T12:00:00`)
      : defaultAnchor

    const preview = buildSchedulePreview({
      home,
      tasks,
      templateDeps,
      anchorDate,
      mode: parsed.data.mode,
      respectExistingScheduledDates: parsed.data.respectExistingScheduledDates,
    })

    return NextResponse.json({
      ...preview,
      defaultAnchorDate: defaultAnchor.toISOString(),
      home: {
        id: home.id,
        addressOrLot: home.addressOrLot,
        subdivisionName: home.subdivision?.name ?? null,
        planName: home.planName,
        planVariant: home.planVariant,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
