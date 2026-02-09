import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/super-admin"
import { createSuperAdminAuditLog } from "@/lib/audit"
import { z } from "zod"

const MAX_ACTIVE_HOMES_BY_TIER: Record<string, number | null> = {
  SMALL: 25,
  MID: 100,
  LARGE: 500,
  WHITE_LABEL: null,
}

const createCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  pricingTier: z.enum(["SMALL", "MID", "LARGE", "WHITE_LABEL"]).optional().default("SMALL"),
})

/**
 * GET /api/super-admin/companies
 * List companies with optional search/filters. SUPER_ADMIN only.
 */
export async function GET(req: Request) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search")?.trim() || ""
  const tier = searchParams.get("tier")?.trim() || ""
  const status = searchParams.get("status")?.trim() || ""
  const nearLimit = searchParams.get("nearLimit") === "true"

  const where: Record<string, unknown> = {}
  if (search) {
    where.name = { contains: search, mode: "insensitive" }
  }
  if (tier) {
    where.pricingTier = tier
  }
  if (status) {
    where.status = status
  }

  const companies = await prisma.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { users: true, homes: true },
      },
    },
  })

  let result = companies.map((c) => ({
    id: c.id,
    name: c.name,
    pricingTier: c.pricingTier,
    maxActiveHomes: c.maxActiveHomes,
    status: c.status,
    userCount: c._count.users,
    homeCount: c._count.homes,
    createdAt: c.createdAt,
  }))

  if (nearLimit) {
    result = result.filter((c) => {
      const max = c.maxActiveHomes
      if (max == null) return false
      return c.homeCount >= max * 0.8
    })
  }

  return NextResponse.json(result)
}

/**
 * POST /api/super-admin/companies
 * Create a new company. SUPER_ADMIN only. Audited.
 */
export async function POST(req: Request) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error
  const actorId = check.id

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
      status: "ACTIVE",
    },
  })

  await createSuperAdminAuditLog(actorId, "COMPANY_CREATED", {
    companyId: company.id,
    name: company.name,
    pricingTier: company.pricingTier,
    maxActiveHomes: company.maxActiveHomes,
  }, company.id, "Company", company.id)

  return NextResponse.json(company)
}
