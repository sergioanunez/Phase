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
    const {
      buildOrderedTemplateCategoryNames,
      categoryDurationByName,
      cumulativeRemainingWorkingDaysByCategory,
    } = await import("@/lib/dashboard/template-phase-remaining")

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

    // Remaining working days: explicit phase staircase from the work template only.
    // Per category C: sum(defaultDurationDays) for items in C. Remaining from C onward = sum of those
    // category totals from C's template position through the last category (NOT dependency/critical-path dates).
    // Earlier bug: CPM "earliest start per category → project end" often matched projectStart for many
    // parallel categories, so every phase showed the full build length.
    const debugRemaining = process.env.DASHBOARD_PHASE_REMAINING_DEBUG === "1"

    const { workTemplateItemWhereForTenant } = await import("@/lib/work-template-tenant-scope")

    const [dbTemplateCategories, templateItems] = await Promise.all([
      prisma.workTemplateCategory.findMany({
        where: { companyId: ctx.companyId },
        orderBy: [{ categoryPosition: "asc" }, { name: "asc" }],
        select: { name: true, categoryPosition: true },
      }),
      prisma.workTemplateItem.findMany({
        where: workTemplateItemWhereForTenant(ctx.companyId),
        select: {
          defaultDurationDays: true,
          optionalCategory: true,
          workTemplateCategory: { select: { name: true } },
        },
      }),
    ])

    const extraNamesFromHomes = orderedCategories.map((c) => c.name)
    const orderedTemplateCategoryNames = buildOrderedTemplateCategoryNames(
      dbTemplateCategories,
      templateItems,
      extraNamesFromHomes
    )
    const durationByCategory = categoryDurationByName(templateItems)
    const { cumulativeByName, totalBuildWorkingDays } = cumulativeRemainingWorkingDaysByCategory(
      orderedTemplateCategoryNames,
      durationByCategory
    )

    const fullBuildDays =
      orderedTemplateCategoryNames.length > 0 || templateItems.length > 0
        ? totalBuildWorkingDays
        : null

    const sumCountByPhase = new Map<string, { sum: number; count: number }>()
    const debugRows: Array<{
      homeId: string
      phaseKey: string
      phaseName: string
      remaining: number | null
    }> = []

    for (const home of homesForPhase) {
      const phase = computeCurrentPhaseForHome(home, orderedCategories)
      let remaining: number | null = null
      if (phase.key === COMPLETE_PHASE_KEY) {
        remaining = 0
      } else if (phase.key === NOT_STARTED_PHASE_KEY) {
        remaining = fullBuildDays
      } else {
        if (orderedTemplateCategoryNames.length === 0 && templateItems.length === 0) {
          remaining = null
        } else {
          remaining = cumulativeByName.get(phase.name) ?? null
        }
      }

      if (debugRemaining)
        debugRows.push({
          homeId: home.id,
          phaseKey: phase.key,
          phaseName: phase.name,
          remaining,
        })

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
        avgDaysByPhase.set(p.key, fullBuildDays)
        continue
      }
      const agg = sumCountByPhase.get(p.key)
      avgDaysByPhase.set(p.key, agg && agg.count > 0 ? Math.round(agg.sum / agg.count) : null)
    }

    if (debugRemaining) {
      const durationEntries = orderedTemplateCategoryNames.map((name) => ({
        name,
        workingDays: durationByCategory.get(name) ?? 0,
        remainingFromCategoryOnward: cumulativeByName.get(name) ?? null,
      }))
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
      console.log("[dashboard:phase-remain]", {
        orderedTemplateCategoryNames,
        durationByCategory: durationEntries,
        totalBuildWorkingDays,
        homes: debugRows,
        aggregatesByPhaseKey: logObj,
      })
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

