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
      computePhaseAverageRemainingDays,
      NOT_STARTED_PHASE_KEY,
      COMPLETE_PHASE_KEY,
    } = await import("@/lib/dashboard/phaseDistribution")
    const { computePulseBySubdivision } = await import("@/lib/dashboard/pulse")

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
    const avgDaysByPhase = computePhaseAverageRemainingDays(
      homesForPhase,
      orderedCategories
    )

    phaseDistribution.phases.forEach((p) => {
      if (p.key === COMPLETE_PHASE_KEY) {
        p.avgRemainingDays = 0
      } else if (p.key === NOT_STARTED_PHASE_KEY) {
        p.avgRemainingDays = null
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

