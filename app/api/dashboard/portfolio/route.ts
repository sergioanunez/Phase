import { NextRequest, NextResponse } from "next/server"
import { getScheduleStatus, type ScheduleStatus } from "@/lib/schedule-status"
import { handleApiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

export interface PortfolioResponse {
  activeHomesCount: number
  statusCounts: { onTrack: number; atRisk: number; behind: number }
  bottlenecks: Array<{ key: string; label: string; count: number }>
  inspectionsUpcoming: Array<{ type: string; count: number }>
  kpis: Array<{ label: string; value: string; delta?: "up" | "down" | null }>
}

export async function GET(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json({ activeHomesCount: 0, statusCounts: { onTrack: 0, atRisk: 0, behind: 0 }, bottlenecks: [], inspectionsUpcoming: [], kpis: [] }, { status: 200 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("dashboard:view")

    const where: Record<string, unknown> = { companyId: ctx.companyId }
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      where.id = { in: assignments.map((a) => a.homeId) }
    }

    // Load homes with forecast/target and tasks with category for aggregates only
    const homes = await prisma.home.findMany({
      where,
      select: {
        id: true,
        forecastCompletionDate: true,
        targetCompletionDate: true,
        startDate: true,
        tasks: {
          select: {
            id: true,
            status: true,
            scheduledDate: true,
            completedAt: true,
            templateItem: { select: { optionalCategory: true, name: true } },
          },
        },
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Schedule status counts (forecast vs target)
    let onTrack = 0
    let atRisk = 0
    let behind = 0
    const statusByHome: Array<ScheduleStatus> = []

    for (const home of homes) {
      const status = getScheduleStatus(
        home.forecastCompletionDate?.toISOString() ?? null,
        home.targetCompletionDate?.toISOString() ?? null
      )
      statusByHome.push(status)
      if (status === "on_track") onTrack++
      else if (status === "at_risk") atRisk++
      else behind++
    }

    const activeHomesCount = homes.length

    // Bottlenecks: categories with overdue tasks (scheduled in past, not completed) — count distinct homes
    const overdueByCategory = new Map<string, Set<string>>()
    for (const home of homes) {
      for (const task of home.tasks) {
        if (
          task.status !== "Completed" &&
          task.scheduledDate &&
          new Date(task.scheduledDate) < today
        ) {
          const category = task.templateItem.optionalCategory || "Other"
          if (!overdueByCategory.has(category)) {
            overdueByCategory.set(category, new Set())
          }
          overdueByCategory.get(category)!.add(home.id)
        }
      }
    }
    const bottlenecks: Array<{ key: string; label: string; count: number }> = []
    overdueByCategory.forEach((homeIds, category) => {
      if (homeIds.size > 0) {
        bottlenecks.push({
          key: category.replace(/\s+/g, "-").toLowerCase(),
          label: category,
          count: homeIds.size,
        })
      }
    })
    bottlenecks.sort((a, b) => b.count - a.count)

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
          task.status !== "Completed"
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
    // TODO: Avg phase duration and avg schedule variance when phase/variance data is available
    const kpis: Array<{ label: string; value: string; delta?: "up" | "down" | null }> = [
      { label: "% Homes on Track", value: `${pctOnTrack}%`, delta: null },
      {
        label: "Avg phase duration",
        value: "—",
        delta: null,
      },
      {
        label: "Avg schedule variance",
        value: "—",
        delta: null,
      },
      {
        label: "Starts vs Completions (MTD)",
        value: "—",
        delta: null,
      },
    ]

    const body: PortfolioResponse = {
      activeHomesCount,
      statusCounts: { onTrack, atRisk, behind },
      bottlenecks,
      inspectionsUpcoming,
      kpis,
    }

    return NextResponse.json(body)
  } catch (error: unknown) {
    console.error("Dashboard portfolio error:", error)
    return handleApiError(error)
  }
}
