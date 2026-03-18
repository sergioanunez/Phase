import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(_req: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireRole } = await import("@/lib/rbac")

    const user = await requireRole("Subcontractor")

    const memberships = await prisma.companyMembership.findMany({
      where: {
        userId: user.id,
        role: "Subcontractor",
        contractorId: { not: null },
      },
      include: {
        company: { select: { id: true, name: true } },
        contractor: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    const tenants = memberships.map((m) => ({
      companyId: m.company.id,
      companyName: m.company.name,
      contractorId: m.contractor?.id ?? null,
      contractorName: m.contractor?.companyName ?? null,
    }))

    return NextResponse.json({ tenants })
  } catch (error: any) {
    console.error("Subcontractor tenants error:", error)
    return NextResponse.json({ error: "Failed to load subcontractor tenants" }, { status: 500 })
  }
}

