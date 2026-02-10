import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const createContractorSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().nullable(),
  trade: z.string().optional().nullable(),
  preferredNoticeDays: z.number().int().positive().optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json([], { status: 200 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("contractors:read")

    const contractors = await prisma.contractor.findMany({
      where: { companyId: ctx.companyId, active: true },
      orderBy: { companyName: "asc" },
    })

    return NextResponse.json(contractors)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("contractors:write")
    const body = await request.json()
    const data = createContractorSchema.parse(body)

    const contractor = await prisma.contractor.create({
      data: {
        companyId: ctx.companyId,
        companyName: data.companyName,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        trade: data.trade,
        preferredNoticeDays: data.preferredNoticeDays,
        active: true,
      },
    })

    await createAuditLog(ctx.userId, "Contractor", contractor.id, "CREATE", null, contractor, ctx.companyId)

    return NextResponse.json(contractor, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
