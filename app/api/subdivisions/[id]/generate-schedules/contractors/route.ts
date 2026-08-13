import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { isTaskIncompleteForProgress } from "@/lib/task-status"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  homeIds: z.array(z.string().min(1)).min(1).max(200),
})

export type BatchScheduleContractorOption = {
  id: string
  name: string
  taskCount: number
}

/**
 * POST /api/subdivisions/[id]/generate-schedules/contractors
 * Tenant-scoped contractors with eligible incomplete task counts on selected houses.
 * Read-only; used by Batch Schedule Generator Step 2.
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

    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const subdivision = await prisma.subdivision.findFirst({
      where: { id: params.id, companyId: ctx.companyId! },
      select: { id: true },
    })
    if (!subdivision) {
      return NextResponse.json({ error: "Subdivision not found" }, { status: 404 })
    }

    const uniqueIds = [...new Set(parsed.data.homeIds)]
    const homes = await prisma.home.findMany({
      where: {
        id: { in: uniqueIds },
        subdivisionId: subdivision.id,
        OR: [
          { companyId: ctx.companyId! },
          { companyId: null, subdivision: { companyId: ctx.companyId! } },
        ],
      },
      select: { id: true },
    })
    if (homes.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more homes were not found in this subdivision." },
        { status: 400 }
      )
    }

    const homeIds = homes.map((h) => h.id)

    const [contractors, tasks] = await Promise.all([
      prisma.contractor.findMany({
        where: { companyId: ctx.companyId!, active: true },
        select: { id: true, companyName: true },
        orderBy: { companyName: "asc" },
      }),
      prisma.homeTask.findMany({
        where: {
          homeId: { in: homeIds },
          companyId: ctx.companyId!,
          contractorId: { not: null },
        },
        select: { contractorId: true, status: true },
      }),
    ])

    const countById = new Map<string, number>()
    for (const t of tasks) {
      if (!t.contractorId) continue
      if (!isTaskIncompleteForProgress(t.status)) continue
      countById.set(t.contractorId, (countById.get(t.contractorId) ?? 0) + 1)
    }

    const options: BatchScheduleContractorOption[] = contractors.map((c) => ({
      id: c.id,
      name: c.companyName,
      taskCount: countById.get(c.id) ?? 0,
    }))

    // Prefer contractors with applicable tasks, then alphabetical.
    options.sort((a, b) => {
      if (a.taskCount !== b.taskCount) return b.taskCount - a.taskCount
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ contractors: options })
  } catch (error) {
    return handleApiError(error)
  }
}
