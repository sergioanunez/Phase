import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { getAssignedHomeIdsForContractor } from "@/lib/tenant"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const createHomeSchema = z.object({
  subdivisionId: z.string(),
  addressOrLot: z.string().min(1),
  startDate: z.string().datetime().optional().nullable(),
  targetCompletionDate: z.string().datetime().optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("homes:read")

    const { searchParams } = new URL(request.url)
    const subdivisionId = searchParams.get("subdivisionId")

    const where: { companyId: string; subdivisionId?: string; id?: { in: string[] } } = {
      companyId: ctx.companyId,
    }
    if (subdivisionId) {
      where.subdivisionId = subdivisionId
    }

    // For Superintendent, filter by assignments
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      where.id = { in: assignments.map((a) => a.homeId) }
    }

    // For Subcontractor, only assigned homes
    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
      if (assignedHomeIds.length === 0) {
        return NextResponse.json([])
      }
      where.id = { in: assignedHomeIds }
    }

    const homes = await prisma.home.findMany({
      where,
      include: {
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
            nameSnapshot: true,
            contractor: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    // Expose plan/thumbnail metadata for UI; do not send storage paths to client.
    // Forecast fields use existing DB values; recompute on home detail or via background job if needed.
    const serialized = homes.map((h) => {
      const { planStoragePath: _p, thumbnailStoragePath: _t, ...rest } = h
      return {
        ...rest,
        hasPlan: !!h.planStoragePath,
        hasThumbnail: !!h.thumbnailStoragePath,
      }
    })
    return NextResponse.json(serialized)
  } catch (error: any) {
    console.error("Error fetching homes:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch homes", details: error.stack },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("homes:write")
    const body = await request.json()
    const data = createHomeSchema.parse(body)

    // Verify subdivision belongs to tenant
    const subdivision = await prisma.subdivision.findFirst({
      where: { id: data.subdivisionId, companyId: ctx.companyId },
    })
    if (!subdivision) {
      return NextResponse.json({ error: "Subdivision not found" }, { status: 404 })
    }

    const home = await prisma.home.create({
      data: {
        companyId: ctx.companyId,
        subdivisionId: data.subdivisionId,
        addressOrLot: data.addressOrLot,
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetCompletionDate: data.targetCompletionDate ? new Date(data.targetCompletionDate) : null,
      },
      include: {
        subdivision: true,
      },
    })

    await createAuditLog(ctx.userId, "Home", home.id, "CREATE", null, home, ctx.companyId)

    // Generate tasks from template (tenant-scoped)
    const templateItems = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { sortOrder: "asc" },
    })

    await Promise.all(
      templateItems.map((item) =>
        prisma.homeTask.create({
          data: {
            companyId: ctx.companyId,
            homeId: home.id,
            templateItemId: item.id,
            nameSnapshot: item.name,
            durationDaysSnapshot: item.defaultDurationDays,
            sortOrderSnapshot: item.sortOrder,
            status: "Unscheduled",
          },
        })
      )
    )

    return NextResponse.json(home, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
