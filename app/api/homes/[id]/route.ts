import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const calendarDateField = z
  .string()
  .optional()
  .nullable()
  .refine(
    (v) =>
      v == null ||
      v === "" ||
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/i.test(v),
    { message: "Date must be YYYY-MM-DD or ISO datetime" }
  )

const updateHomeSchema = z.object({
  subdivisionId: z.string().optional(),
  addressOrLot: z.string().min(1).optional(),
  startDate: calendarDateField,
  targetCompletionDate: calendarDateField,
  planName: z.string().optional().nullable(),
  planVariant: z.string().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    let home = await prisma.home.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, subdivision: { companyId: ctx.companyId } },
        ],
      },
      include: {
        subdivision: true,
        tasks: {
          include: {
            contractor: true,
            reportedCompleteBy: { select: { id: true, name: true } },
            lastRescheduledBy: { select: { id: true, name: true } },
            templateItem: {
              select: {
                id: true,
                name: true,
                optionalCategory: true,
                isCriticalGate: true,
                gateName: true,
                sequenceOrder: true,
                sortOrder: true,
              },
            },
          },
          orderBy: [...homeTaskOrderByTemplateSequence()],
        },
        assignments: {
          include: {
            superintendent: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Fallback: find by id and check company in code (handles Prisma OR edge cases)
    if (!home) {
      const byId = await prisma.home.findUnique({
        where: { id: params.id },
        include: {
          subdivision: true,
          tasks: {
            include: {
              contractor: true,
              reportedCompleteBy: { select: { id: true, name: true } },
              lastRescheduledBy: { select: { id: true, name: true } },
              templateItem: {
                select: {
                  id: true,
                  name: true,
                  optionalCategory: true,
                  isCriticalGate: true,
                  gateName: true,
                  sequenceOrder: true,
                  sortOrder: true,
                },
              },
            },
            orderBy: [...homeTaskOrderByTemplateSequence()],
          },
          assignments: {
            include: {
              superintendent: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      })
      const canAccess =
        byId &&
        (byId.companyId === ctx.companyId ||
          (byId.companyId == null && byId.subdivision?.companyId === ctx.companyId))
      if (canAccess) home = byId
    }

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    // Check if Superintendent has access
    if (ctx.role === "Superintendent") {
      const hasAccess = home.assignments.some(
        (a) => a.superintendentUserId === ctx.userId
      )
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Validation: Fix any tasks with status "Scheduled" but no scheduledDate
    const tasksToFix = home.tasks.filter(
      (task) => task.status === "Scheduled" && !task.scheduledDate
    )
    
    if (tasksToFix.length > 0) {
      await Promise.all(
        tasksToFix.map((task) =>
          prisma.homeTask.update({
            where: { id: task.id },
            data: { status: "Unscheduled" },
          })
        )
      )
      
      // Refetch home with corrected tasks
      const correctedHome = await prisma.home.findUnique({
        where: { id: params.id },
        include: {
          subdivision: true,
          tasks: {
            include: {
              contractor: true,
              templateItem: true,
            },
            orderBy: [...homeTaskOrderByTemplateSequence()],
          },
          assignments: {
            include: {
              superintendent: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      })
      
      return NextResponse.json(correctedHome)
    }

    return NextResponse.json(home)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("homes:write")
    const body = await request.json()
    const data = updateHomeSchema.parse(body)

    const before = await prisma.home.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
    })

    if (!before) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const updateData: any = {}
    if (data.subdivisionId !== undefined)
      updateData.subdivisionId = data.subdivisionId
    if (data.addressOrLot !== undefined)
      updateData.addressOrLot = data.addressOrLot
    const { parseCalendarDateInput } = await import("@/lib/calendar-date")
    if (data.startDate !== undefined)
      updateData.startDate = data.startDate ? parseCalendarDateInput(data.startDate) : null
    if (data.targetCompletionDate !== undefined)
      updateData.targetCompletionDate = data.targetCompletionDate
        ? parseCalendarDateInput(data.targetCompletionDate)
        : null
    if (data.planName !== undefined) updateData.planName = data.planName
    if (data.planVariant !== undefined) updateData.planVariant = data.planVariant

    const after = await prisma.home.update({
      where: { id: params.id },
      data: updateData,
      include: {
        subdivision: true,
      },
    })

    await createAuditLog(ctx.userId, "Home", params.id, "UPDATE", before, after, ctx.companyId)

    return NextResponse.json(after)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map((e) => e.message).join("; ") || "Invalid input"
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("homes:write")

    const before = await prisma.home.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
    })

    if (!before) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    await prisma.home.delete({
      where: { id: params.id },
    })

    await createAuditLog(ctx.userId, "Home", params.id, "DELETE", before, null, ctx.companyId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return handleApiError(error)
  }
}
