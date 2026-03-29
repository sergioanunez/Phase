import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { PunchStatus } from "@prisma/client"
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
    const { canSubcontractorReportOnPunch } = await import("@/lib/subcontractor-report-access")
    const { notifyTenantPunchReportedComplete } = await import("@/lib/notify-reported-complete")

    const user = await requireRole("Subcontractor")
    const json = await request.json().catch(() => ({}))
    const { note } = bodySchema.parse(json)

    const punch = await prisma.punchItem.findUnique({
      where: { id: params.id },
      include: {
        home: { select: { companyId: true, addressOrLot: true } },
        assignedContractor: { select: { companyName: true } },
        relatedHomeTask: {
          select: {
            contractorId: true,
            companyId: true,
            home: { select: { companyId: true } },
          },
        },
      },
    })

    if (!punch) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    const allowed = await canSubcontractorReportOnPunch(user.id, {
      assignedContractorId: punch.assignedContractorId,
      companyId: punch.companyId,
      home: { companyId: punch.home.companyId },
      relatedHomeTask: punch.relatedHomeTask,
    })
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (punch.status === PunchStatus.Closed || punch.status === PunchStatus.Canceled) {
      return NextResponse.json({ error: "Punch is already closed" }, { status: 400 })
    }

    const wasAlreadyReported = punch.reportedCompleteAt != null

    const companyId = punch.companyId ?? punch.home.companyId
    if (!companyId) {
      return NextResponse.json({ error: "Punch has no tenant scope" }, { status: 400 })
    }
    const reporter = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    })

    let taskContractorName: string | null = null
    if (punch.relatedHomeTask.contractorId) {
      const c = await prisma.contractor.findUnique({
        where: { id: punch.relatedHomeTask.contractorId },
        select: { companyName: true },
      })
      taskContractorName = c?.companyName ?? null
    }
    const contractorLabel = punch.assignedContractor?.companyName ?? taskContractorName ?? "Contractor"

    const updated = await prisma.punchItem.update({
      where: { id: params.id },
      data: {
        reportedCompleteAt: new Date(),
        reportedCompleteByUserId: user.id,
        reportedCompleteNote: note?.trim() ? note.trim() : null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignedContractor: { select: { id: true, companyName: true } },
        closedBy: { select: { id: true, name: true } },
        reportedCompleteBy: { select: { id: true, name: true } },
        relatedHomeTask: {
          include: {
            home: { include: { subdivision: true } },
          },
        },
        photos: { orderBy: { createdAt: "asc" } },
      },
    })

    if (!wasAlreadyReported) {
      await notifyTenantPunchReportedComplete({
        prisma,
        companyId,
        homeId: punch.homeId,
        punchId: punch.id,
        punchTitle: punch.title,
        address: punch.home.addressOrLot,
        contractorLabel,
        reportingUserName: reporter?.name ?? "Subcontractor",
      }).catch((err) => console.error("notifyTenantPunchReportedComplete:", err))
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
    console.error("report-complete punch:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
