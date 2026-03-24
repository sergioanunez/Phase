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
      NOT_STARTED_PHASE_KEY,
      COMPLETE_PHASE_KEY,
    } = await import("@/lib/dashboard/phaseDistribution")
    const { computePulseBySubdivision } = await import("@/lib/dashboard/pulse")
    const { computeCategoryCriticalPathDuration } = await import(
      "@/lib/scheduling/categoryDuration"
    )

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
        },
      })),
    }))

    const phaseDistribution = computePhaseDistribution(homesForPhase)

    // Compute template-based critical path duration by category, then derive
    // remaining working days to completion per phase (template-based, not per-home).
    const { workTemplatePrismaOrderBy, sortWorkTemplatesForDisplay } = await import(
      "@/lib/work-template-display-order"
    )
    const templates = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [...workTemplatePrismaOrderBy()],
      include: {
        dependencies: {
          select: { dependsOnItemId: true },
        },
      },
    })

    let projectTotalDays = 0
    const remainingByCategory = new Map<string, number>()

    if (templates.length > 0) {
      const byCat: Record<
        string,
        Array<{
          id: string
          defaultDurationDays?: number
          dependencies?: Array<{ dependsOnItemId: string }>
        }>
      > = {}

      for (const t of templates) {
        const categoryName = (t.optionalCategory || "Uncategorized").trim()
        if (!byCat[categoryName]) byCat[categoryName] = []
        byCat[categoryName].push({
          id: t.id,
          defaultDurationDays: t.defaultDurationDays ?? undefined,
          dependencies: t.dependencies.map((d) => ({ dependsOnItemId: d.dependsOnItemId })),
        })
      }

      const sortedForCategoryOrder = sortWorkTemplatesForDisplay(templates)
      const orderedTemplateCategories: string[] = []
      const seenCat = new Set<string>()
      for (const t of sortedForCategoryOrder) {
        const categoryName = (t.optionalCategory || "Uncategorized").trim()
        if (seenCat.has(categoryName)) continue
        seenCat.add(categoryName)
        orderedTemplateCategories.push(categoryName)
      }

      const categoryDurations = new Map<string, number>()
      for (const [name, templatesInCat] of Object.entries(byCat)) {
        const d = computeCategoryCriticalPathDuration(templatesInCat)
        categoryDurations.set(name, d ?? 0)
      }

      projectTotalDays = orderedTemplateCategories.reduce((sum, name) => {
        return sum + (categoryDurations.get(name) ?? 0)
      }, 0)

      let remaining = projectTotalDays
      for (const name of orderedTemplateCategories) {
        remainingByCategory.set(name, remaining)
        remaining -= categoryDurations.get(name) ?? 0
      }
    }

    phaseDistribution.phases.forEach((p) => {
      if (p.key === NOT_STARTED_PHASE_KEY) {
        p.avgRemainingDays = projectTotalDays > 0 ? projectTotalDays : null
      } else if (p.key === COMPLETE_PHASE_KEY) {
        p.avgRemainingDays = 0
      } else {
        p.avgRemainingDays = remainingByCategory.get(p.name) ?? null
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

