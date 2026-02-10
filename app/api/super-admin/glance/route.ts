import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/**
 * GET /api/super-admin/glance
 * Companies needing attention for dashboard table. SUPER_ADMIN only.
 */
export async function GET() {
  if (isBuild()) return NextResponse.json([], { status: 200 })
  const { requireSuperAdmin } = await import("@/lib/super-admin")
  const { prisma } = await import("@/lib/prisma")
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const companies = await prisma.company.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      pricingTier: true,
      status: true,
      maxActiveHomes: true,
      updatedAt: true,
    },
  })

  const companyIds = companies.map((c) => c.id)
  const [homeCounts, smsSent7d, smsFailed7d, lastHomeActivity] = await Promise.all([
    prisma.home.groupBy({
      by: ["companyId"],
      where: { companyId: { in: companyIds } },
      _count: { id: true },
    }),
    prisma.smsMessage.groupBy({
      by: ["companyId"],
      where: { companyId: { in: companyIds }, createdAt: { gte: sevenDaysAgo } },
      _count: { id: true },
    }),
    prisma.smsMessage.groupBy({
      by: ["companyId"],
      where: {
        companyId: { in: companyIds },
        status: "Failed",
        createdAt: { gte: sevenDaysAgo },
      },
      _count: { id: true },
    }),
    prisma.home.findMany({
      where: { companyId: { in: companyIds } },
      orderBy: { updatedAt: "desc" },
      select: { companyId: true, updatedAt: true },
      distinct: ["companyId"],
    }),
  ])

  const homeCountByCompany = Object.fromEntries(homeCounts.map((r) => [r.companyId ?? "", r._count.id]))
  const sentByCompany = Object.fromEntries(smsSent7d.map((r) => [r.companyId ?? "", r._count.id]))
  const failedByCompany = Object.fromEntries(smsFailed7d.map((r) => [r.companyId ?? "", r._count.id]))
  const lastActivityByCompany = Object.fromEntries(
    lastHomeActivity.map((h) => [h.companyId ?? "", h.updatedAt.toISOString()])
  )

  const rows = companies.map((c) => {
    const activeHomes = homeCountByCompany[c.id] ?? 0
    const max = c.maxActiveHomes
    const sent = sentByCompany[c.id] ?? 0
    const failed = failedByCompany[c.id] ?? 0
    const confirmationRate7d = sent > 0 ? Math.round(((sent - failed) / sent) * 100) : null
    const smsFailureRate7d = sent > 0 ? Math.round((failed / sent) * 100) : 0
    return {
      id: c.id,
      name: c.name,
      tier: c.pricingTier,
      status: c.status,
      activeHomes,
      maxActiveHomes: max,
      lastActivity: lastActivityByCompany[c.id] ?? c.updatedAt.toISOString(),
      confirmationRate7d,
      smsFailureRate7d,
    }
  })

  return NextResponse.json(rows)
}
