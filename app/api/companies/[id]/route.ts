import { NextResponse } from "next/server"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/** Max active homes per tier. WHITE_LABEL = unlimited (null). */
const MAX_ACTIVE_HOMES_BY_TIER: Record<string, number | null> = {
  SMALL: 25,
  MID: 100,
  LARGE: 500,
  WHITE_LABEL: null,
}

const updateCompanySchema = z.object({
  pricingTier: z.enum(["SMALL", "MID", "LARGE", "WHITE_LABEL"]),
})

/**
 * PATCH /api/companies/[id]
 * Update a company (e.g. tier). SUPER_ADMIN only. maxActiveHomes is set from tier.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const check = await requireSuperAdmin()
    if ("error" in check) return check.error

    const { id } = await params
    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const body = await req.json()
    const parsed = updateCompanySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { pricingTier } = parsed.data
    const maxActiveHomes = MAX_ACTIVE_HOMES_BY_TIER[pricingTier] ?? null
    const updated = await prisma.company.update({
      where: { id },
      data: { pricingTier, maxActiveHomes },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error("PATCH /api/companies/[id] error:", e)
    return NextResponse.json({ error: "Failed to update company" }, { status: 500 })
  }
}

/**
 * DELETE /api/companies/[id]
 * Delete a builder company and all related data. SUPER_ADMIN only.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const check = await requireSuperAdmin()
    if ("error" in check) return check.error

    const { id } = await params
    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    await prisma.company.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("DELETE /api/companies/[id] error:", e)
    return NextResponse.json({ error: "Failed to delete company" }, { status: 500 })
  }
}
