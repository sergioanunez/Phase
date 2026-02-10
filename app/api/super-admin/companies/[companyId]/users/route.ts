import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * GET /api/super-admin/companies/:companyId/users
 * List users for a company. SUPER_ADMIN only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  if (isBuildTime) return buildGuardResponse()
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
