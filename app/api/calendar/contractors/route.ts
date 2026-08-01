import { NextRequest, NextResponse } from "next/server"
import { parseISO } from "date-fns"
import { TaskStatus } from "@prisma/client"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"
import { parseCalendarQueryFilters } from "@/lib/calendar/filters"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export type CalendarContractorOption = {
  id: string
  name: string
  taskCount: number
}

/**
 * GET /api/calendar/contractors?start=&end=&subdivisionId=
 * Contractors with scheduled-task counts in the calendar window (server-side).
 * Uses homes:read so supers can filter without contractors:read.
 */
export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")
    const filters = parseCalendarQueryFilters(searchParams)

    if (!startParam || !endParam) {
      return NextResponse.json(
        { error: "Query params start and end (ISO date) are required" },
        { status: 400 }
      )
    }

    const start = parseISO(startParam)
    const end = parseISO(endParam)

    let allowedHomeIds: string[] | null = null
    if (ctx.role === "Superintendent" && ctx.companyId && ctx.userId) {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      allowedHomeIds = assignments.length > 0 ? assignments.map((a) => a.homeId) : []
    }

    const taskWhere = {
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      scheduledDate: { gte: start, lte: end },
      status: { notIn: [TaskStatus.Canceled, TaskStatus.NotApplicable] },
      contractorId: { not: null },
      ...(allowedHomeIds !== null ? { homeId: { in: allowedHomeIds } } : {}),
      ...(filters.subdivisionId
        ? { home: { subdivisionId: filters.subdivisionId } }
        : {}),
    }

    const [grouped, contractors] = await Promise.all([
      prisma.homeTask.groupBy({
        by: ["contractorId"],
        where: taskWhere,
        _count: { _all: true },
      }),
      prisma.contractor.findMany({
        where: {
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          active: true,
        },
        select: { id: true, companyName: true },
        orderBy: { companyName: "asc" },
      }),
    ])

    const countById = new Map<string, number>()
    for (const row of grouped) {
      if (row.contractorId) countById.set(row.contractorId, row._count._all)
    }

    const options: CalendarContractorOption[] = contractors.map((c) => ({
      id: c.id,
      name: c.companyName,
      taskCount: countById.get(c.id) ?? 0,
    }))

    // Prefer contractors with work first, then alphabetical among zeros? Spec: alphabetical.
    options.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ contractors: options })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
