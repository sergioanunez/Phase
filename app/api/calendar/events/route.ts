import { NextRequest, NextResponse } from "next/server"
import { getAssignedHomeIdsForContractor } from "@/lib/tenant"
import { getScheduleStatus } from "@/lib/schedule-status"
import { handleApiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

export type CalendarEventType = "inspection" | "delivery" | "trade" | "milestone"

export interface CalendarEvent {
  id: string
  date: string
  type: CalendarEventType
  title: string
  communityName?: string
  homeCount?: number
  homeId?: string
  homeLabel?: string
  status?: "on_track" | "at_risk" | "behind" | "completed" | "overdue"
}

function inferEventType(name: string, category: string | null): CalendarEventType {
  const n = name.toLowerCase()
  const c = (category ?? "").toLowerCase()
  if (n.includes("inspection") || c.includes("inspection")) return "inspection"
  if (n.includes("delivery") || n.includes("deliver")) return "delivery"
  if (c.includes("foundation") || c.includes("structural") || c.includes("framing")) return "inspection"
  if (n.includes("truss") && (n.includes("delivery") || n.includes("deliver"))) return "delivery"
  if (n.includes("window") && (n.includes("delivery") || n.includes("deliver"))) return "delivery"
  if (c.includes("finals") || c.includes("pre-sale") || c.includes("milestone")) return "milestone"
  return "trade"
}

export async function GET(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json([], { status: 200 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")
    const subdivisionId = searchParams.get("subdivisionId")

    const start = startParam ? new Date(startParam) : new Date()
    const end = endParam ? new Date(endParam) : new Date(start)
    end.setDate(end.getDate() + 31)

    const where: Record<string, unknown> = {
      companyId: ctx.companyId,
      scheduledDate: { gte: start, lte: end },
      status: { not: "Canceled" },
    }

    if (subdivisionId) {
      where.home = { subdivisionId, companyId: ctx.companyId }
    }

    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      where.homeId = { in: assignments.map((a) => a.homeId) }
    }

    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
      if (assignedHomeIds.length === 0) return NextResponse.json([])
      where.homeId = { in: assignedHomeIds }
    }

    const tasks = await prisma.homeTask.findMany({
      where,
      include: {
        home: {
          select: {
            id: true,
            addressOrLot: true,
            forecastCompletionDate: true,
            targetCompletionDate: true,
            subdivision: { select: { name: true } },
          },
        },
        templateItem: { select: { optionalCategory: true } },
      },
      orderBy: { scheduledDate: "asc" },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const events: CalendarEvent[] = tasks.map((task) => {
      const scheduled = task.scheduledDate!
      const dateStr = scheduled.toISOString().slice(0, 10)
      const isOverdue = new Date(dateStr) < today && task.status !== "Completed"
      const isCompleted = task.status === "Completed"
      const homeStatus = getScheduleStatus(
        task.home.forecastCompletionDate?.toISOString() ?? null,
        task.home.targetCompletionDate?.toISOString() ?? null
      )

      let status: CalendarEvent["status"] = "on_track"
      if (isCompleted) status = "completed"
      else if (isOverdue) status = "overdue"
      else if (homeStatus === "at_risk") status = "at_risk"
      else if (homeStatus === "behind") status = "behind"

      return {
        id: task.id,
        date: dateStr,
        type: inferEventType(task.nameSnapshot, task.templateItem.optionalCategory),
        title: task.nameSnapshot,
        communityName: task.home.subdivision.name,
        homeId: task.home.id,
        homeLabel: task.home.addressOrLot,
        status,
      }
    })

    return NextResponse.json(events)
  } catch (error: unknown) {
    console.error("Calendar events error:", error)
    return handleApiError(error)
  }
}
