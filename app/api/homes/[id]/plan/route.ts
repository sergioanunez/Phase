import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const SIGNED_URL_EXPIRES_IN = 60 * 15 // 15 minutes

/**
 * GET /api/homes/:homeId/plan
 * Returns plan metadata + signed URL for viewing. Authorized roles only.
 * Signed URL is generated on demand; if expired, client should call again.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const { createSupabaseServerClient, HOME_PLANS_BUCKET } = await import("@/lib/supabase/server")
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await requirePermission("homes:read")

    const home = await prisma.home.findUnique({
      where: { id: params.id },
      include: {
        assignments: { select: { superintendentUserId: true } },
        planUploadedBy: { select: { id: true, name: true } },
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    // Superintendent: only if assigned to this home
    if (session.user.role === "Superintendent") {
      const hasAccess = home.assignments.some(
        (a) => a.superintendentUserId === session.user.id
      )
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    if (!home.planStoragePath) {
      return NextResponse.json({
        exists: false,
        planName: home.planName,
        planVariant: home.planVariant,
      })
    }

    const supabase = createSupabaseServerClient()
    const { data: signed, error: signedError } = await supabase.storage
      .from(HOME_PLANS_BUCKET)
      .createSignedUrl(home.planStoragePath, SIGNED_URL_EXPIRES_IN)

    if (signedError || !signed?.signedUrl) {
      console.error("Supabase signed URL error:", signedError)
      return NextResponse.json(
        { error: "Failed to generate plan link" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      exists: true,
      planName: home.planName,
      planVariant: home.planVariant,
      planFileType: home.planFileType,
      signedUrl: signed.signedUrl,
      uploadedAt: home.planUploadedAt,
      uploadedBy: home.planUploadedBy
        ? { id: home.planUploadedBy.id, name: home.planUploadedBy.name }
        : null,
    })
  } catch (error: any) {
    console.error("Error fetching home plan:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch plan" },
      { status: 500 }
    )
  }
}
