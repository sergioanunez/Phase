import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { addWorkingDays } from "@/lib/working-days"
import { computeTemplateSchedule } from "@/lib/gantt/template-schedule"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** Gantt is Admin-only (templates:read is Admin in this app). */
export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:read")

    const { searchParams } = new URL(request.url)
    const projectStartParam = searchParams.get("projectStartDate")
    let projectStartDate: Date
    if (projectStartParam) {
      const parsed = new Date(projectStartParam)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid projectStartDate" },
          { status: 400 }
        )
      }
      projectStartDate = parsed
    } else {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      projectStartDate = addWorkingDays(today, 1)
    }

    const items = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ optionalCategory: "asc" }, { sortOrder: "asc" }],
      include: {
        dependencies: { select: { dependsOnItemId: true } },
      },
    })

    const tasks = items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.optionalCategory ?? null,
      durationDays: Math.max(0, item.defaultDurationDays),
      dependencyIds: item.dependencies.map((d) => d.dependsOnItemId),
      sequenceOrder: item.sortOrder,
    }))

    const result = computeTemplateSchedule(tasks, projectStartDate)

    // Sort tasks by Order field (sequenceOrder) only, to match Work Items Template list
    const sortedTasks = [...result.tasks].sort(
      (a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)
    )

    return NextResponse.json({
      projectStartDate: result.projectStartDate.toISOString(),
      tasks: sortedTasks.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        durationDays: t.durationDays,
        dependencyIds: t.dependencyIds,
        sequenceOrder: t.sequenceOrder,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate.toISOString(),
        isCritical: t.isCritical,
        depth: t.depth,
      })),
      links: result.links,
      criticalPathIds: result.criticalPathIds,
      cycleDetected: result.cycleDetected,
      cycleTaskIds: result.cycleTaskIds,
      error: result.error,
    })
  } catch (e: unknown) {
    const { handleApiError } = await import("@/lib/api-response")
    return handleApiError(e)
  }
}
