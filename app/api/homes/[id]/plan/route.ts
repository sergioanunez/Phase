import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { LEGACY_PLAN_ID } from "@/lib/home-plans"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const SIGNED_URL_EXPIRES_IN = 60 * 15 // 15 minutes

/**
 * GET /api/homes/:homeId/plan
 * Optional query: planId — `legacy` or a HomePlan cuid. If omitted, uses legacy path when set, else latest HomePlan.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createSupabaseServerClient, HOME_PLANS_BUCKET } = await import("@/lib/supabase/server")

    const { id: homeId } = await Promise.resolve(params)
    const planId = request.nextUrl.searchParams.get("planId")

    const ctx = await requireTenantPermission("homes:read")

    const home = await prisma.home.findFirst({
      where: {
        id: homeId,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, subdivision: { companyId: ctx.companyId } },
        ],
      },
      include: {
        assignments: { select: { superintendentUserId: true } },
        planUploadedBy: { select: { id: true, name: true } },
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    if (ctx.role === "Superintendent") {
      const hasAccess = home.assignments.some((a) => a.superintendentUserId === ctx.userId)
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    let storagePath: string | null = null
    let planFileType = home.planFileType
    let displayPlanName = home.planName
    let displayVariant = home.planVariant

    if (planId && planId !== LEGACY_PLAN_ID) {
      const row = await prisma.homePlan.findFirst({
        where: { id: planId, homeId },
      })
      if (!row) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 })
      }
      storagePath = row.storagePath
      planFileType = row.planFileType
      displayPlanName = row.fileName
      displayVariant = null
    } else if (planId === LEGACY_PLAN_ID) {
      storagePath = home.planStoragePath
    } else {
      if (home.planStoragePath) {
        storagePath = home.planStoragePath
      } else {
        const latest = await prisma.homePlan.findFirst({
          where: { homeId },
          orderBy: { createdAt: "desc" },
        })
        if (latest) {
          storagePath = latest.storagePath
          planFileType = latest.planFileType
          displayPlanName = latest.fileName
          displayVariant = null
        }
      }
    }

    if (!storagePath) {
      return NextResponse.json({
        exists: false,
        planName: home.planName,
        planVariant: home.planVariant,
      })
    }

    const supabase = createSupabaseServerClient()
    const { data: signed, error: signedError } = await supabase.storage
      .from(HOME_PLANS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN)

    if (signedError || !signed?.signedUrl) {
      console.error("Supabase signed URL error:", signedError)
      return NextResponse.json({ error: "Failed to generate plan link" }, { status: 500 })
    }

    return NextResponse.json({
      exists: true,
      planName: displayPlanName,
      planVariant: displayVariant,
      planFileType,
      signedUrl: signed.signedUrl,
      uploadedAt: home.planUploadedAt,
      uploadedBy: home.planUploadedBy
        ? { id: home.planUploadedBy.id, name: home.planUploadedBy.name }
        : null,
    })
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined
    if (status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("Error fetching home plan:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch plan" },
      { status: 500 }
    )
  }
}
