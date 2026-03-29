import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { TaskStatus } from "@prisma/client"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireRole } = await import("@/lib/rbac")
    const { canSubcontractorReportOnTask } = await import("@/lib/subcontractor-report-access")
    const { notifyTenantTaskReportedComplete } = await import("@/lib/notify-reported-complete")

    const user = await requireRole("Subcontractor")
    const json = await request.json().catch(() => ({}))
    const { note } = bodySchema.parse(json)

    const task = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: {
        home: { select: { companyId: true, addressOrLot: true } },
        contractor: { select: { companyName: true } },
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const allowed = await canSubcontractorReportOnTask(user.id, {
      contractorId: task.contractorId,
      companyId: task.companyId,
      home: { companyId: task.home.companyId },
    })
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (task.status === TaskStatus.Completed) {
      return NextResponse.json({ error: "Task is already completed" }, { status: 400 })
    }

    const companyId = task.companyId ?? task.home.companyId
    const reporter = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    })

    const wasAlreadyReported = task.reportedCompleteAt != null

    const updated = await prisma.homeTask.update({
      where: { id: params.id },
      data: {
        reportedCompleteAt: new Date(),
        reportedCompleteByUserId: user.id,
        reportedCompleteNote: note?.trim() ? note.trim() : null,
      },
      include: {
        home: { include: { subdivision: true } },
        contractor: true,
        templateItem: true,
        lastRescheduledBy: { select: { id: true, name: true } },
        reportedCompleteBy: { select: { id: true, name: true } },
        smsMessages: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    })

    if (!wasAlreadyReported) {
      await notifyTenantTaskReportedComplete({
        prisma,
        companyId,
        homeId: task.homeId,
        taskId: task.id,
        taskName: task.nameSnapshot,
        address: task.home.addressOrLot,
        contractorLabel: task.contractor?.companyName ?? "Contractor",
        reportingUserName: reporter?.name ?? "Subcontractor",
      }).catch((err) => console.error("notifyTenantTaskReportedComplete:", err))
    }

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : "Failed to report complete"
    if (message === "Forbidden" || message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("report-complete task:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
