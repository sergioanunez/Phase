import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const createSubdivisionSchema = z.object({
  name: z.string().min(1),
})

export async function GET(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json([], { status: 200 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("subdivisions:read")

    const subdivisions = await prisma.subdivision.findMany({
      where: { companyId: ctx.companyId },
      include: {
        homes: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(subdivisions)
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
    const ctx = await requireTenantPermission("subdivisions:write")
    const body = await request.json()
    const data = createSubdivisionSchema.parse(body)

    const subdivision = await prisma.subdivision.create({
      data: {
        companyId: ctx.companyId,
        name: data.name,
      },
    })

    await createAuditLog(ctx.userId, "Subdivision", subdivision.id, "CREATE", null, subdivision, ctx.companyId)

    return NextResponse.json(subdivision, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map((e) => e.message).join("; ") || "Invalid input"
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return handleApiError(error)
  }
}
