import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/super-admin"

/**
 * GET /api/super-admin/audit
 * Global audit logs with filters. SUPER_ADMIN only.
 */
export async function GET(req: Request) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get("companyId") || undefined
  const actorUserId = searchParams.get("actorUserId") || undefined
  const action = searchParams.get("action") || undefined
  const from = searchParams.get("from") || undefined
  const to = searchParams.get("to") || undefined
  const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10))
  const pageSize = Math.min(50, Math.max(10, parseInt(searchParams.get("pageSize") || "20", 10)))

  const where: Record<string, unknown> = {}
  if (companyId) where.companyId = companyId
  if (actorUserId) where.userId = actorUserId
  if (action) where.action = action
  if (from || to) {
    where.createdAt = {}
    if (from) (where.createdAt as Record<string, Date>).gte = new Date(from)
    if (to) (where.createdAt as Record<string, Date>).lte = new Date(to)
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, pageSize })
}
