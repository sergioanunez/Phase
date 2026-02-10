import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

// GET /api/homes/[id]/gates - Get gate statuses for a home
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json([], { status: 200 })

    const { getServerSession } = await import("next-auth/next")
    const { authOptions } = await import("@/lib/auth")
    const { requirePermission } = await import("@/lib/rbac")
    const { getHomeGateStatus } = await import("@/lib/gates")

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
