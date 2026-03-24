import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(_req: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireRole } = await import("@/lib/rbac")

    const user = await requireRole("Subcontractor")

    const { listSubcontractorTenantsForUser } = await import(
      "@/lib/subcontractor-tenants"
    )
    const tenants = await listSubcontractorTenantsForUser(user.id)

    return NextResponse.json({ tenants })
  } catch (error: any) {
    console.error("Subcontractor tenants error:", error)
    return NextResponse.json({ error: "Failed to load subcontractor tenants" }, { status: 500 })
  }
}

