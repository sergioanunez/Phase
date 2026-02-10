import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/**
 * GET /api/super-admin/summary
 * Dashboard metrics. SUPER_ADMIN only.
 */
export async function GET() {
  if (isBuild()) return NextResponse.json({ totalCompanies: 0, activeCompanies: 0, totalUsers: 0, smsErrorsLast24h: 0, companiesNearLimit: 0 }, { status: 200 })
  const { requireSuperAdmin } = await import("@/lib/super-admin")
  const { prisma } = await import("@/lib/prisma")
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [companies, activeCompanies, userCount, smsFailed24h, homesByCompany] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { companyId: { not: null } } }),
    prisma.smsMessage.count({ where: { status: "Failed", createdAt: { gte: oneDayAgo } } }),
    prisma.home.groupBy({ by: ["companyId"], _count: { id: true }, where: { companyId: { not: null } } }),
  ])

  const homeCountByCompany = Object.fromEntries(homesByCompany.map((r) => [r.companyId ?? "", r._count.id]))
  const companiesWithLimit = await prisma.company.findMany({
    where: { maxActiveHomes: { not: null }, status: "ACTIVE" },
    select: { id: true, maxActiveHomes: true },
  })
  let companiesNearLimit = 0
  for (const c of companiesWithLimit) {
    const active = homeCountByCompany[c.id] ?? 0
    const max = c.maxActiveHomes ?? 0
    if (max > 0 && active >= max * 0.8) companiesNearLimit++
  }

  return NextResponse.json({
    totalCompanies: companies,
    activeCompanies,
    totalUsers: userCount,
    smsErrorsLast24h: smsFailed24h,
    companiesNearLimit,
  })
}
