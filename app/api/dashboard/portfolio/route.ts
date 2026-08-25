import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { isTaskIncompleteForProgress } from "@/lib/task-status"
import {
  countByScheduleStatus,
  groupHomesByScheduleStatus,
  type DashboardHouseRowData,
  type DrilldownHomeInput,
} from "@/lib/dashboard/drilldown"
import {
  buildDelaysTracker,
  type DelaysTrackerResult,
  type DelayedTaskInput,
} from "@/lib/dashboard/delays-tracker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export interface PortfolioResponse {
  activeHomesCount: number
  statusCounts: { notStarted: number; onTrack: number; atRisk: number; behind: number }
  homesByStatus: Record<"not_started" | "on_track" | "at_risk" | "behind", DashboardHouseRowData[]>
  delaysTracker: DelaysTrackerResult
  inspectionsUpcoming: Array<{ type: string; count: number }>
  kpis: Array<{ label: string; value: string; delta?: "up" | "down" | null }>
}

export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { getBuildCycleTimeKpi } = await import("@/lib/dashboard/buildCycleTime")
    const { getAverageDelayPerHomeKpi } = await import("@/lib/dashboard/averageDelayPerHome")
    const ctx = await requireTenantPermission("dashboard:view")

    const where: Record<string, unknown> = { companyId: ctx.companyId }
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      where.id = { in: assignments.map((a) => a.homeId) }
    }

    // Same home set as before; extra fields only for in-place drill-down lists.
    const homes = await prisma.home.findMany({
      where,
      select: {
        id: true,
        addressOrLot: true,
        displayOrder: true,
        createdAt: true,
        isComplete: true,
        forecastCompletionDate: true,
        targetCompletionDate: true,
        startDate: true,
        subdivision: { select: { id: true, name: true } },
        tasks: {
          select: {
            id: true,
            status: true,
            scheduledDate: true,
            completedAt: true,
            updatedAt: true,
            isCriticalPath: true,
            durationDaysSnapshot: true,
            nameSnapshot: true,
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
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const drillHomes: DrilldownHomeInput[] = homes.map((home) => ({
      id: home.id,
      addressOrLot: home.addressOrLot,
      startDate: home.startDate,
      createdAt: home.createdAt,
      displayOrder: home.displayOrder,
      isComplete: home.isComplete,
      forecastCompletionDate: home.forecastCompletionDate,
      targetCompletionDate: home.targetCompletionDate,
      subdivision: home.subdivision,
      tasks: home.tasks.map((t) => ({
        id: t.id,
        status: t.status,
        scheduledDate: t.scheduledDate,
        completedAt: t.completedAt,
        updatedAt: t.updatedAt,
        isCriticalPath: t.isCriticalPath,
        durationDaysSnapshot: t.durationDaysSnapshot,
        name: t.nameSnapshot || t.templateItem.name,
        optionalCategory: t.templateItem.optionalCategory,
        sortOrder: t.templateItem.sortOrder,
        sequenceOrder: t.templateItem.sequenceOrder ?? null,
        isCriticalGate: t.templateItem.isCriticalGate,
      })),
    }))

    const homesByStatus = groupHomesByScheduleStatus(drillHomes)
    const { notStarted, onTrack, atRisk, behind } = countByScheduleStatus(drillHomes)

    const activeHomesCount = homes.length

    // Delays Tracker: confirmed + scheduled before today + not started.
    // Qualification also requires ≥1 working day past schedule (excludes weekends / “due today”).
    let delaysTracker: DelaysTrackerResult = {
      summary: { delayedTaskCount: 0, contractorCount: 0, homeCount: 0 },
      contractors: [],
    }
    const homeIds = homes.map((h) => h.id)
    if (homeIds.length > 0) {
      const delayedTasksRaw = await prisma.homeTask.findMany({
        where: {
          companyId: ctx.companyId,
          status: "Confirmed",
          startedAt: null,
          scheduledDate: { lt: today },
          contractorId: { not: null },
          homeId: { in: homeIds },
        },
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          confirmedAt: true,
          startedAt: true,
          nameSnapshot: true,
          contractorId: true,
          contractor: { select: { id: true, companyName: true } },
          home: {
            select: {
              id: true,
              addressOrLot: true,
              displayOrder: true,
              subdivision: { select: { name: true } },
            },
          },
        },
      })

      const delayedInputs: DelayedTaskInput[] = delayedTasksRaw.map((t) => ({
        id: t.id,
        status: t.status,
        scheduledDate: t.scheduledDate,
        confirmedAt: t.confirmedAt,
        startedAt: t.startedAt,
        name: t.nameSnapshot,
        contractorId: t.contractorId ?? t.contractor?.id ?? null,
        contractorName: t.contractor?.companyName ?? null,
        homeId: t.home.id,
        address: t.home.addressOrLot,
        subdivisionName: t.home.subdivision?.name ?? "",
        displayOrder: t.home.displayOrder,
      }))
      delaysTracker = buildDelaysTracker(delayedInputs, today)
    }

    // Upcoming inspections: next 7–10 days — group by inspection-like categories
    // TODO: Map template categories to "Foundation Inspections", "Framing Inspections", "Final Inspections" when inspection types are defined
    const inspectionCategories = [
      "Foundation",
      "Structural",
      "Finals punches and inspections",
    ]
    const inspectionsByType = new Map<string, Set<string>>()
    const tenDaysFromNow = new Date(today)
    tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10)
    for (const home of homes) {
      for (const task of home.tasks) {
        const cat = task.templateItem.optionalCategory || ""
        const isInspectionType = inspectionCategories.some((c) =>
          cat.toLowerCase().includes(c.toLowerCase())
        )
        if (!isInspectionType) continue
        if (
          task.scheduledDate &&
          new Date(task.scheduledDate) >= today &&
          new Date(task.scheduledDate) <= tenDaysFromNow &&
          isTaskIncompleteForProgress(task.status)
        ) {
          const typeLabel =
            cat.toLowerCase().includes("foundation")
              ? "Foundation Inspections"
              : cat.toLowerCase().includes("structural") ||
                  cat.toLowerCase().includes("framing")
                ? "Framing Inspections"
                : "Final Inspections"
          if (!inspectionsByType.has(typeLabel)) {
            inspectionsByType.set(typeLabel, new Set())
          }
          inspectionsByType.get(typeLabel)!.add(`${home.id}-${task.id}`)
        }
      }
    }
    const inspectionsUpcoming: Array<{ type: string; count: number }> = []
    inspectionsByType.forEach((ids, type) => {
      inspectionsUpcoming.push({ type, count: ids.size })
    })

    // KPIs
    const pctOnTrack =
      activeHomesCount > 0
        ? Math.round((onTrack / activeHomesCount) * 100)
        : 0

    const buildCycle = await getBuildCycleTimeKpi(ctx.companyId)
    const avgDelay = await getAverageDelayPerHomeKpi(ctx.companyId)

    const kpis: Array<{ label: string; value: string; delta?: "up" | "down" | null }> = []

    kpis.push({ label: "% Homes on Track", value: `${pctOnTrack}%`, delta: null })

    if (buildCycle.averageWorkingDays != null) {
      kpis.push({
        label: "Build Cycle Time",
        value: `${buildCycle.averageWorkingDays} wd avg`,
        delta: null,
      })
    } else {
      kpis.push({
        label: "Build Cycle Time",
        value: "—",
        delta: null,
      })
    }

    if (avgDelay.averageDelayDays != null) {
      const sign = avgDelay.averageDelayDays > 0 ? "+" : ""
      const value = `${sign}${avgDelay.averageDelayDays} days`
      const delta: "up" | "down" | null =
        avgDelay.averageDelayDays < 0 ? "up" : avgDelay.averageDelayDays > 0 ? "down" : null
      kpis.push({
        label: "Average Delay per Home",
        value,
        delta,
      })
    } else {
      kpis.push({
        label: "Average Delay per Home",
        value: "—",
        delta: null,
      })
    }

    kpis.push({
      label: "Starts vs Completions (MTD)",
      value: "—",
      delta: null,
    })

    const body: PortfolioResponse = {
      activeHomesCount,
      statusCounts: { notStarted, onTrack, atRisk, behind },
      homesByStatus,
      delaysTracker,
      inspectionsUpcoming,
      kpis,
    }

    return NextResponse.json(body)
  } catch (error: unknown) {
    console.error("Dashboard portfolio error:", error)
    return handleApiError(error)
  }
}
