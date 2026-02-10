import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { requirePermission } from "@/lib/rbac"
import { getHomeGateStatus } from "@/lib/gates"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

// GET /api/homes/[id]/gates - Get gate statuses for a home
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await requirePermission("homes:read")

    const gateStatuses = await getHomeGateStatus(params.id)

    return NextResponse.json(gateStatuses)
  } catch (error: any) {
    console.error("Error fetching gate statuses:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch gate statuses" },
      { status: 500 }
    )
  }
}
