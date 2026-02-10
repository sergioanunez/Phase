import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * GET /api/super-admin/users/:userId
 * Get one user by id. SUPER_ADMIN only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  if (isBuildTime) return buildGuardResponse()
  const { requireSuperAdmin } = await import("@/lib/super-admin")
  const { prisma } = await import("@/lib/prisma")
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const { userId } = await params
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      isActive: true,
      companyId: true,
      contractorId: true,
      createdAt: true,
      company: { select: { name: true } },
      contractor: { select: { companyName: true } },
    },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  return NextResponse.json(user)
}
