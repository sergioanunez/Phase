import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { LEGACY_PLAN_ID, listMergedHomePlans } from "@/lib/home-plans"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

function requireAdmin(session: { user?: { id: string; role?: string } } | null) {
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 as const }
  }
  if (session.user.role !== "Admin") {
    return { error: "Forbidden: Settings access required", status: 403 as const }
  }
  return null
}

/**
 * DELETE /api/admin/homes/:homeId/plans/:planId — remove one attachment (HomePlan row or legacy primary via `legacy`).
 */
export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: { homeId: string; planId: string } | Promise<{ homeId: string; planId: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { createAuditLog } = await import("@/lib/audit")
    const { createSupabaseServerClient, HOME_PLANS_BUCKET } = await import("@/lib/supabase/server")

    const { homeId, planId } = await Promise.resolve(params)
    if (!homeId || !planId) {
      return NextResponse.json({ error: "Home ID and plan ID are required" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    const authError = requireAdmin(session)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

    const home = await prisma.home.findUnique({ where: { id: homeId } })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const rows = await prisma.homePlan.findMany({ where: { homeId } })
    if (listMergedHomePlans(home, rows).length <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining plan for this home." },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    if (planId === LEGACY_PLAN_ID) {
      if (!home.planStoragePath) {
        return NextResponse.json({ error: "No legacy primary plan to delete" }, { status: 400 })
      }
      const pathToRemove = home.planStoragePath
      await supabase.storage.from(HOME_PLANS_BUCKET).remove([pathToRemove])
      await prisma.homePlan.deleteMany({ where: { homeId, storagePath: pathToRemove } })
      await prisma.home.update({
        where: { id: homeId },
        data: {
          planStoragePath: null,
          planFileName: null,
          planFileType: null,
          planName: null,
          planVariant: null,
          planUploadedAt: null,
          planUploadedByUserId: null,
        },
      })
      await createAuditLog(session!.user!.id, "Home", homeId, "HOME_PLAN_DELETED", { legacy: true }, null)
      return NextResponse.json({ success: true })
    }

    const row = await prisma.homePlan.findFirst({
      where: { id: planId, homeId },
    })
    if (!row) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    await supabase.storage.from(HOME_PLANS_BUCKET).remove([row.storagePath])
    await prisma.homePlan.delete({ where: { id: row.id } })

    if (home.planStoragePath === row.storagePath) {
      await prisma.home.update({
        where: { id: homeId },
        data: {
          planStoragePath: null,
          planFileName: null,
          planFileType: null,
          planName: null,
          planVariant: null,
          planUploadedAt: null,
          planUploadedByUserId: null,
        },
      })
    }

    await createAuditLog(
      session!.user!.id,
      "Home",
      homeId,
      "HOME_PLAN_ROW_DELETED",
      { planId: row.id, storagePath: row.storagePath },
      null
    )

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting home plan row:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete plan" },
      { status: 500 }
    )
  }
}
