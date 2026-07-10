import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { PlanFileType } from "@prisma/client"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { finalizeHomePlanUploads } from "@/lib/admin-home-plan-upload"

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

const bodySchema = z.object({
  mode: z.enum(["legacy", "multi"]),
  planTag: z.string().optional(),
  planName: z.string().optional().nullable(),
  planVariant: z.string().optional().nullable(),
  uploads: z
    .array(
      z.object({
        storagePath: z.string().min(1),
        fileName: z.string().min(1),
        planFileType: z.nativeEnum(PlanFileType),
        mimeType: z.string(),
      })
    )
    .min(1),
})

/**
 * POST /api/admin/homes/:homeId/plan/complete
 * Records plan metadata after the browser uploaded files directly to Supabase.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { createAuditLog } = await import("@/lib/audit")

    const resolved = await Promise.resolve(params)
    const homeId = resolved?.homeId
    if (!homeId) {
      return NextResponse.json({ error: "Home ID is required" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    const authError = requireAdmin(session)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

    const home = await prisma.home.findUnique({ where: { id: homeId } })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const body = bodySchema.parse(await request.json())
    const userId = session!.user!.id
    const planTag = (body.planTag || "Floor Plan").trim()
    const planNameFromForm = body.planName?.trim() || null
    const planVariant = body.planVariant ?? null

    if (body.mode === "legacy") {
      const before = {
        planStoragePath: home.planStoragePath,
        planFileName: home.planFileName,
        planFileType: home.planFileType,
        planName: home.planName,
        planVariant: home.planVariant,
        planUploadedAt: home.planUploadedAt,
        planUploadedByUserId: home.planUploadedByUserId,
      }

      const result = await finalizeHomePlanUploads({
        prisma,
        home,
        homeId,
        userId,
        mode: "legacy",
        planTag,
        planNameFromForm,
        planVariant,
        uploads: body.uploads,
      })

      const updated = await prisma.home.findUnique({
        where: { id: homeId },
        include: { planUploadedBy: { select: { id: true, name: true } } },
      })

      await createAuditLog(userId, "Home", homeId, "HOME_PLAN_UPLOADED", before, {
        planStoragePath: updated?.planStoragePath,
        planFileName: updated?.planFileName,
        planFileType: updated?.planFileType,
        planName: updated?.planName,
        planVariant: updated?.planVariant,
        planUploadedAt: updated?.planUploadedAt,
        planUploadedByUserId: updated?.planUploadedByUserId,
      })

      return NextResponse.json({
        mode: "legacy",
        planName: result.kind === "legacy" ? result.planName : null,
        planFileName: result.kind === "legacy" ? result.planFileName : null,
        planVariant: result.kind === "legacy" ? result.planVariant : null,
        planFileType: result.kind === "legacy" ? result.planFileType : null,
        planUploadedAt: result.kind === "legacy" ? result.planUploadedAt : null,
        uploadedBy: result.kind === "legacy" ? result.uploadedBy : null,
      })
    }

    const existingHomePlanCount = await prisma.homePlan.count({ where: { homeId } })
    const beforeMulti = { homePlanCount: existingHomePlanCount }

    const multi = await finalizeHomePlanUploads({
      prisma,
      home,
      homeId,
      userId,
      mode: "multi",
      planTag,
      planNameFromForm,
      planVariant,
      uploads: body.uploads,
    })

    if (multi.kind !== "multi") {
      return NextResponse.json({ error: "Upload finalization failed" }, { status: 500 })
    }

    await createAuditLog(userId, "Home", homeId, "HOME_PLANS_UPLOADED", beforeMulti, {
      homePlanCount: existingHomePlanCount + multi.created.length,
      created: multi.created,
    })

    return NextResponse.json({
      mode: "multi",
      created: multi.created,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid upload completion request" }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : "Failed to complete upload"
    console.error("[plan/complete]", error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
