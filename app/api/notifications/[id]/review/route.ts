import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BUILDER_ROLES = ["Admin", "Manager", "Superintendent"]

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { markReviewed } = await import("@/lib/notifications")

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!BUILDER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const companyId = (session.user as { companyId?: string | null }).companyId
    if (!companyId) {
      return NextResponse.json({ error: "No company context" }, { status: 403 })
    }

    const notification = await prisma.notification.findFirst({
      where: { id: params.id, companyId },
    })
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    await markReviewed(params.id, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Review notification error:", error)
    return NextResponse.json({ error: "Failed to mark as reviewed" }, { status: 500 })
  }
}
