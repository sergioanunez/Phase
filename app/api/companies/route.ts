import { NextResponse } from "next/server"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/**
 * GET /api/companies
 * Returns all builder companies. SUPER_ADMIN only.
 */
export async function GET() {
  try {
    if (isBuild()) return NextResponse.json([], { status: 200 })
    const { prisma } = await import("@/lib/prisma")
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const check = await requireSuperAdmin()
    if ("error" in check) return check.error

    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        pricingTier: true,
        maxActiveHomes: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            homes: true,
            contractors: true,
          },
        },
        users: {
          where: { role: "Admin" },
          select: { id: true, name: true, email: true, role: true },
        },
      },
    })

    return NextResponse.json(companies)
  } catch (e) {
    console.error("GET /api/companies error:", e)
    return NextResponse.json({ error: "Failed to load companies" }, { status: 500 })
  }
}

const createCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  pricingTier: z.enum(["SMALL", "MID", "LARGE", "WHITE_LABEL"]).optional().default("SMALL"),
})

/** Max active homes per tier. WHITE_LABEL = unlimited (null). */
const MAX_ACTIVE_HOMES_BY_TIER: Record<string, number | null> = {
  SMALL: 25,
  MID: 100,
  LARGE: 500,
  WHITE_LABEL: null,
}

/**
 * POST /api/companies
 * Create a new builder company. SUPER_ADMIN only. maxActiveHomes is set from tier.
 */
export async function POST(req: Request) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const check = await requireSuperAdmin()
    if ("error" in check) return check.error

    const body = await req.json()
    const parsed = createCompanySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { name, pricingTier } = parsed.data
    const maxActiveHomes = MAX_ACTIVE_HOMES_BY_TIER[pricingTier] ?? null
    const company = await prisma.company.create({
      data: {
        name,
        pricingTier,
        maxActiveHomes,
      },
    })
    return NextResponse.json(company)
  } catch (e) {
    console.error("POST /api/companies error:", e)
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 })
  }
}
