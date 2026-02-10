import { NextRequest, NextResponse } from "next/server"
import { checkGateBlocking } from "@/lib/gates"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const rescheduleSchema = z.object({
  scheduledDate: z.string().datetime(),
  contractorId: z.string().optional().nullable(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const user = await requirePermission("tasks:write")
    const body = await request.json()
    const data = rescheduleSchema.parse(body)

    const before = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: {
        contractor: true,
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Only allow rescheduling for Scheduled or Confirmed tasks
    if (before.status !== "Scheduled" && before.status !== "Confirmed") {
      return NextResponse.json(
        { error: "Task must be Scheduled or Confirmed to reschedule" },
        { status: 400 }
      )
    }

    if (!before.scheduledDate) {
      return NextResponse.json(
        { error: "Task does not have a scheduled date to reschedule" },
        { status: 400 }
      )
    }

    const newScheduledDate = new Date(data.scheduledDate)

    // Check gate blocking for the new date (same as scheduling)
    const gateCheck = await checkGateBlocking(
      before.homeId,
      params.id,
      before.sortOrderSnapshot
    )

    if (gateCheck.isBlocked) {
      return NextResponse.json(
        {
          error: `Rescheduling blocked until "${gateCheck.blockingGateName}" punchlist is cleared. ${gateCheck.openPunchCount} open punch item(s) remaining.`,
          gateBlocked: true,
          blockingGateName: gateCheck.blockingGateName,
          openPunchCount: gateCheck.openPunchCount,
        },
        { status: 409 }
      )
    }

    // Update task with new scheduled date
    const updateData: any = {
      scheduledDate: newScheduledDate,
    }

    // If task was Confirmed, change status to Scheduled so they can send a new confirmation
    if (before.status === "Confirmed") {
      updateData.status = "Scheduled"
    }

    // Update contractor if provided
    if (data.contractorId !== undefined) {
      updateData.contractorId = data.contractorId
    }

    const after = await prisma.homeTask.update({
      where: { id: params.id },
      data: updateData,
      include: {
        contractor: true,
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    await createAuditLog(user.id, "HomeTask", params.id, "UPDATE", before, after)

    return NextResponse.json(after)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || "Failed to reschedule task" },
      { status: 500 }
    )
  }
}
