import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/**
 * GET /api/super-admin/sms/health
 * SMS delivery metrics. SUPER_ADMIN only.
 */
export async function GET() {
  if (isBuild()) return NextResponse.json({ last24h: { sent: 0, delivered: 0, failed: 0 }, last7d: { sent: 0, failed: 0, failureRatePercent: 0 }, errorsByCompany: [], recentFailures: [] }, { status: 200 })
  const { requireSuperAdmin } = await import("@/lib/super-admin")
  const { prisma } = await import("@/lib/prisma")
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [sent24h, delivered24h, failed24h, sent7d, failed7d, failedByCompany] = await Promise.all([
    prisma.smsMessage.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.smsMessage.count({ where: { status: "Delivered", createdAt: { gte: oneDayAgo } } }),
    prisma.smsMessage.count({ where: { status: "Failed", createdAt: { gte: oneDayAgo } } }),
    prisma.smsMessage.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.smsMessage.count({ where: { status: "Failed", createdAt: { gte: sevenDaysAgo } } }),
    prisma.smsMessage.groupBy({
      by: ["companyId"],
      where: { status: "Failed", createdAt: { gte: sevenDaysAgo } },
      _count: { id: true },
    }),
  ])

  const failureRate7d = sent7d > 0 ? Math.round((failed7d / sent7d) * 100) : 0
  const companyIds = failedByCompany.map((r) => r.companyId).filter(Boolean) as string[]
  const companies = companyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true },
      })
    : []
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c.name]))
  const errorsByCompany = failedByCompany.map((r) => ({
    companyId: r.companyId,
    companyName: companyMap[r.companyId ?? ""] ?? "Unknown",
    failedCount: r._count.id,
  }))

  const recentFailures = await prisma.smsMessage.findMany({
    where: { status: "Failed", createdAt: { gte: sevenDaysAgo } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      to: true,
      from: true,
      body: true,
      createdAt: true,
      companyId: true,
      company: { select: { name: true } },
    },
  })

  return NextResponse.json({
    last24h: { sent: sent24h, delivered: delivered24h, failed: failed24h },
    last7d: { sent: sent7d, failed: failed7d, failureRatePercent: failureRate7d },
    errorsByCompany,
    recentFailures,
  })
}
