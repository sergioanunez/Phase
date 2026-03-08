import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const commitRowSchema = z.object({
  companyName: z.string().min(1),
  trade: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().nullable(),
  leadTimeDays: z.number().int().min(0),
})

const commitBodySchema = z.object({
  rows: z.array(commitRowSchema),
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
    const { rows } = commitBodySchema.parse(body)
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No rows to import" },
        { status: 400 }
      )
    }

    const { prisma } = await import("@/lib/prisma")
    const { createAuditLog } = await import("@/lib/audit")

    const batch = await prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          companyId: ctx.companyId!,
          createdByUserId: ctx.userId,
        },
      })
      for (const row of rows) {
        await tx.contractor.create({
          data: {
            companyId: ctx.companyId!,
            companyName: row.companyName,
            contactName: row.companyName,
            phone: row.phone,
            email: row.email ?? undefined,
            trade: row.trade,
            leadDays: row.leadTimeDays,
            importBatchId: batch.id,
            active: true,
          },
        })
      }
      return batch
    })

    const created = await prisma.contractor.count({
      where: { importBatchId: batch.id },
    })

    await createAuditLog(
      ctx.userId,
      "ImportBatch",
      batch.id,
      "CREATE",
      null,
      { id: batch.id, contractorsCreated: created },
      ctx.companyId!
    )

    return NextResponse.json({
      success: true,
      importBatchId: batch.id,
      added: created,
      summary: { added: created },
    })
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: e.errors }, { status: 400 })
    }
    console.error("Contractor import commit error:", e)
    return NextResponse.json(
      { error: e?.message ?? "Failed to import contractors" },
      { status: 500 }
    )
  }
}
