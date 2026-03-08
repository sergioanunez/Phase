import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const undoBodySchema = z.object({
  importBatchId: z.string().min(1),
})

function allowImportRole(role: string): boolean {
  return role === "Admin" || role === "Manager"
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireTenantContext } = await import("@/lib/tenant")
    const ctx = await requireTenantContext()
    if (!allowImportRole(ctx.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { importBatchId } = undoBodySchema.parse(body)

    const { prisma } = await import("@/lib/prisma")

    const batch = await prisma.importBatch.findFirst({
      where: { id: importBatchId, companyId: ctx.companyId! },
      include: {
        contractors: {
          select: {
            id: true,
            _count: {
              select: {
                homeTasks: true,
                templateItems: true,
                contractorAssignments: true,
                assignedPunchItems: true,
              },
            },
          },
        },
      },
    })

    if (!batch) {
      return NextResponse.json(
        { error: "Import batch not found or access denied" },
        { status: 404 }
      )
    }

    const canDelete = batch.contractors.filter(
      (c) =>
        c._count.homeTasks === 0 &&
        c._count.templateItems === 0 &&
        c._count.contractorAssignments === 0 &&
        c._count.assignedPunchItems === 0
    )
    const inUse = batch.contractors.length - canDelete.length

    if (canDelete.length === 0) {
      return NextResponse.json(
        {
          error:
            inUse > 0
              ? "Cannot undo: all imported contractors are assigned to tasks or work template."
              : "No contractors to undo.",
        },
        { status: 400 }
      )
    }

    const ids = canDelete.map((c) => c.id)
    await prisma.contractor.deleteMany({
      where: { id: { in: ids } },
    })

    return NextResponse.json({
      success: true,
      undone: ids.length,
      skippedInUse: inUse,
    })
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: e.errors }, { status: 400 })
    }
    console.error("Contractor import undo error:", e)
    return NextResponse.json(
      { error: e?.message ?? "Failed to undo import" },
      { status: 500 }
    )
  }
}
