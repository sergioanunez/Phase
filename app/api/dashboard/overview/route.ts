import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const {
      computePhaseDistribution,
      deriveOrderedCategories,
      computeCurrentPhaseForHome,
      NOT_STARTED_PHASE_KEY,
      COMPLETE_PHASE_KEY,
    } = await import("@/lib/dashboard/phaseDistribution")
    const { computePulseBySubdivision } = await import("@/lib/dashboard/pulse")
    const { computeTemplateSchedule } = await import("@/lib/gantt/template-schedule")
    const { workingDaysBetween } = await import("@/lib/forecast")

    const ctx = await requireTenantPermission("dashboard:view")

    const where: {
      companyId: string
      isComplete: boolean
      id?: { in: string[] }
    } = {
      companyId: ctx.companyId,
      isComplete: false, // active homes only
    }

    // For Superintendent, filter by assignments
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      if (assignments.length > 0) {
        where.id = { in: assignments.map((a) => a.homeId) }
      } else {
        return NextResponse.json({ phaseDistribution: { phases: [], totalActiveHomes: 0, hasTemplate: false }, pulse: [] })
      }
    }

    const homes = await prisma.home.findMany({
      where,
      select: {
        id: true,
        addressOrLot: true,
        startDate: true,
        createdAt: true,
        isComplete: true,
        forecastCompletionDate: true,
        subdivision: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          select: {
            id: true,
            status: true,
            scheduledDate: true,
            completedAt: true,
            updatedAt: true,
            isCriticalPath: true,
            templateItem: {
              select: {
                name: true,
                optionalCategory: true,
                sortOrder: true,
                sequenceOrder: true,
                isCriticalGate: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    if (homes.length === 0) {
      return NextResponse.json({
        phaseDistribution: { phases: [], totalActiveHomes: 0, hasTemplate: false },
        pulse: [],
      })
    }

    const homesForPhase = homes.map((h) => ({
      id: h.id,
      addressOrLot: h.addressOrLot,
      startDate: h.startDate,
      createdAt: h.createdAt,
      isComplete: h.isComplete,
      forecastCompletionDate: h.forecastCompletionDate,
      tasks: h.tasks.map((t) => ({
        id: t.id,
        status: t.status,
        scheduledDate: t.scheduledDate,
        templateItem: {
          name: t.templateItem.name,
          optionalCategory: t.templateItem.optionalCategory,
          sortOrder: t.templateItem.sortOrder,
          sequenceOrder: t.templateItem.sequenceOrder ?? null,
        },
      })),
    }))

    const phaseDistribution = computePhaseDistribution(homesForPhase)
    const orderedCategories = deriveOrderedCategories(homesForPhase)

    // Remaining working days to final completion:
    // Deterministic countdown derived from the tenant's template schedule + dependencies,
    // using each home's current template phase as detected by computeCurrentPhaseForHome.
    //
    // We intentionally do NOT use home.forecastCompletionDate here because it can skew phase-level
    // averages into "phase-local" durations instead of "time remaining to completion".
    const debugRemaining = process.env.DASHBOARD_PHASE_REMAINING_DEBUG === "1"

    const templateTasks = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      select: {
        id: true,
        name: true,
        optionalCategory: true,
        defaultDurationDays: true,
      },
    })

    const templateTaskIdSet = new Set(templateTasks.map((t) => t.id))

    const templateDeps = await prisma.templateDependency.findMany({
      where: { OR: [{ companyId: ctx.companyId }, { companyId: null }] },
      select: { templateItemId: true, dependsOnItemId: true },
    })

    const depsByTemplateItemId = new Map<string, string[]>()
    for (const d of templateDeps) {
      if (!templateTaskIdSet.has(d.templateItemId)) continue
      if (!templateTaskIdSet.has(d.dependsOnItemId)) continue
      const cur = depsByTemplateItemId.get(d.templateItemId) ?? []
      cur.push(d.dependsOnItemId)
      depsByTemplateItemId.set(d.templateItemId, cur)
    }

    const sanitizedCategory = (raw: string | null): string =>
      (raw ?? "").trim() || "Uncategorized"

    const templateInputTasks = templateTasks.map((t) => ({
      id: t.id,
      name: t.name,
      category: sanitizedCategory(t.optionalCategory),
      durationDays: t.defaultDurationDays ?? 0,
      dependencyIds: depsByTemplateItemId.get(t.id) ?? [],
    }))

    const projectStart = new Date()
    projectStart.setHours(0, 0, 0, 0)
    const templateSchedule = computeTemplateSchedule(templateInputTasks, projectStart)

    const scheduleTasks = templateSchedule.tasks ?? []
    const projectEnd =
      scheduleTasks.length > 0
        ? scheduleTasks.reduce(
            (max, t) => (t.endDate > max ? t.endDate : max),
            templateSchedule.projectStartDate
          )
        : templateSchedule.projectStartDate

    const totalRemainingWorkingDays =
      scheduleTasks.length > 0 ? workingDaysBetween(templateSchedule.projectStartDate, projectEnd) : null

    // Earliest template start per category name
    const earliestStartByCategory = new Map<string, Date>()
    for (const t of scheduleTasks) {
      const cat = sanitizedCategory(t.category ?? null)
      const existing = earliestStartByCategory.get(cat)
      if (!existing || t.startDate < existing) earliestStartByCategory.set(cat, t.startDate)
    }

    const remainingByCategoryKey = new Map<string, number | null>()
    for (const c of orderedCategories) {
      const start = earliestStartByCategory.get(c.name)
      remainingByCategoryKey.set(
        c.key,
        start && scheduleTasks.length > 0 ? workingDaysBetween(start, projectEnd) : null
      )
    }

    const sumCountByPhase = new Map<string, { sum: number; count: number }>()
    const debugRows: Array<{ homeId: string; phaseKey: string; remaining: number | null }> = []

    for (const home of homesForPhase) {
      const phase = computeCurrentPhaseForHome(home, orderedCategories)
      let remaining: number | null = null
      if (phase.key === COMPLETE_PHASE_KEY) {
        remaining = 0
      } else if (phase.key === NOT_STARTED_PHASE_KEY) {
        remaining = totalRemainingWorkingDays
      } else {
        remaining = remainingByCategoryKey.get(phase.key) ?? null
      }

      if (debugRemaining) debugRows.push({ homeId: home.id, phaseKey: phase.key, remaining })

      if (remaining == null) continue
      const cur = sumCountByPhase.get(phase.key) ?? { sum: 0, count: 0 }
      cur.sum += remaining
      cur.count += 1
      sumCountByPhase.set(phase.key, cur)
    }

    const avgDaysByPhase = new Map<string, number | null>()
    for (const p of phaseDistribution.phases) {
      if (p.key === COMPLETE_PHASE_KEY) {
        avgDaysByPhase.set(p.key, 0)
        continue
      }
      if (p.key === NOT_STARTED_PHASE_KEY) {
        avgDaysByPhase.set(p.key, totalRemainingWorkingDays)
        continue
      }
      const agg = sumCountByPhase.get(p.key)
      avgDaysByPhase.set(p.key, agg && agg.count > 0 ? Math.round(agg.sum / agg.count) : null)
    }

    if (debugRemaining) {
      // Minimal, phase-level logging to validate staircase behavior.
      const byPhase = new Map<string, { count: number; values: number[] }>()
      for (const r of debugRows) {
        const cur = byPhase.get(r.phaseKey) ?? { count: 0, values: [] }
        cur.count += 1
        if (r.remaining != null) cur.values.push(r.remaining)
        byPhase.set(r.phaseKey, cur)
      }
      const logObj = Array.from(byPhase.entries()).map(([phaseKey, v]) => ({
        phaseKey,
        homeCount: v.count,
        remainingAvg: v.values.length ? Math.round(v.values.reduce((a, b) => a + b, 0) / v.values.length) : null,
        min: v.values.length ? Math.min(...v.values) : null,
        max: v.values.length ? Math.max(...v.values) : null,
      }))
      console.log("[dashboard:phase-remain]", { orderedCategories, logObj })
    }

    phaseDistribution.phases.forEach((p) => {
      if (p.key === COMPLETE_PHASE_KEY) {
        p.avgRemainingDays = 0
      } else if (p.key === NOT_STARTED_PHASE_KEY) {
        p.avgRemainingDays = avgDaysByPhase.get(p.key) ?? null
      } else {
        p.avgRemainingDays = avgDaysByPhase.get(p.key) ?? null
      }
    })

    const pulse = computePulseBySubdivision(
      homes.map((h) => ({
        id: h.id,
        addressOrLot: h.addressOrLot,
        startDate: h.startDate,
        createdAt: h.createdAt,
        isComplete: h.isComplete,
        subdivision: h.subdivision,
        tasks: h.tasks.map((t) => ({
          id: t.id,
          status: t.status,
          scheduledDate: t.scheduledDate,
          completedAt: t.completedAt,
          updatedAt: t.updatedAt,
          isCriticalPath: t.isCriticalPath,
          templateItem: {
            name: t.templateItem.name,
            isCriticalGate: t.templateItem.isCriticalGate,
          },
        })),
      }))
    )

    return NextResponse.json({ phaseDistribution, pulse })
  } catch (error) {
    console.error("Dashboard overview error:", error)
    return handleApiError(error)
  }
}

