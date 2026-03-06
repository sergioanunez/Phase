import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

// GET /api/tasks/[id]/punch-items/public-link - Get public punchlist link for this task (if any)
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    await requirePermission("homes:read")

    const share = await prisma.punchlistShare.findFirst({
      where: { homeTaskId: params.id, enabled: true },
      orderBy: { createdAt: "desc" },
    })

    if (!share) {
      return NextResponse.json({ publicLink: null, sentAt: null })
    }

    const { buildPublicPunchlistUrl } = await import("@/lib/punchlists/publicLink")
    const publicLink = buildPublicPunchlistUrl(share.token)

    return NextResponse.json({
      publicLink,
      sentAt: share.sentAt?.toISOString() ?? null,
    })
  } catch (error: any) {
    console.error("Error fetching public punchlist link:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch public link" },
      { status: 500 }
    )
  }
}
