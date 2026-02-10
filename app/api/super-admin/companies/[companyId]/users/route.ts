import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/**
 * GET /api/super-admin/companies/:companyId/users
 * List users for a company. SUPER_ADMIN only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  if (isBuild()) return NextResponse.json([], { status: 200 })
  const { requireSuperAdmin } = await import("@/lib/super-admin")
  const { prisma } = await import("@/lib/prisma")
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const { companyId } = await params
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      isActive: true,
      createdAt: true,
      contractorId: true,
      contractor: { select: { companyName: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(users)
}
