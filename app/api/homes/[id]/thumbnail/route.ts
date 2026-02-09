import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"
import { getSupabaseServerClient, HOME_PLANS_BUCKET } from "@/lib/supabase-server"

const SIGNED_URL_EXPIRES_IN = 60 * 15 // 15 minutes

/**
 * GET /api/homes/:id/thumbnail
 * Returns signed URL for house thumbnail. Authorized roles only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const resolved = await Promise.resolve(params)
    const homeId = resolved?.id
    if (!homeId) {
      return NextResponse.json({ error: "Home ID is required" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await requirePermission("homes:read")

    const home = await prisma.home.findUnique({
      where: { id: homeId },
      include: {
        assignments: { select: { superintendentUserId: true } },
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    if (session.user.role === "Superintendent") {
      const hasAccess = home.assignments.some(
        (a) => a.superintendentUserId === session.user.id
      )
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    if (!home.thumbnailStoragePath) {
      return NextResponse.json({ exists: false })
    }

    const supabase = getSupabaseServerClient()
    const { data: signed, error: signedError } = await supabase.storage
      .from(HOME_PLANS_BUCKET)
      .createSignedUrl(home.thumbnailStoragePath, SIGNED_URL_EXPIRES_IN)

    if (signedError || !signed?.signedUrl) {
      console.error("Supabase signed URL error:", signedError)
      return NextResponse.json(
        { error: "Failed to generate thumbnail link" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      exists: true,
      signedUrl: signed.signedUrl,
    })
  } catch (error: unknown) {
    console.error("Error fetching home thumbnail:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch thumbnail" },
      { status: 500 }
    )
  }
}
