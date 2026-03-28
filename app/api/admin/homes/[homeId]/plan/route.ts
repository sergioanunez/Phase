import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"
import {
  shouldUseLegacySingleUpload,
  uploadLegacySinglePlan,
  uploadMultiHomePlans,
} from "@/lib/admin-home-plan-upload"

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

const patchPlanSchema = z.object({
  planName: z.string().optional().nullable(),
  planVariant: z.string().optional().nullable(),
})

function collectFiles(formData: FormData): File[] {
  return formData
    .getAll("file")
    .filter((x): x is File => typeof File !== "undefined" && x instanceof File && x.size > 0)
}

/**
 * POST /api/admin/homes/:homeId/plan - Upload floor plan(s) (Settings access required)
 *
 * - One file + tag "Floor Plan" + no HomePlan rows yet: legacy path (updates Home.planStoragePath at …/floorplan.ext).
 * - Otherwise: HomePlan rows under homes/{id}/plans/{id}.ext (migrates legacy into HomePlan first if needed).
 *
 * Form fields: file (repeatable), planTag (optional, default Floor Plan), planName, planVariant
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

    const home = await prisma.home.findUnique({
      where: { id: homeId },
      include: { subdivision: true },
    })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const formData = await request.formData()
    const files = collectFiles(formData)
    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const planTagRaw = ((formData.get("planTag") as string) || "Floor Plan").trim()
    const planNameFromForm = (formData.get("planName") as string)?.trim() || null
    const planVariant = (formData.get("planVariant") as string) || null

    const existingHomePlanCount = await prisma.homePlan.count({ where: { homeId } })
    const useLegacy = shouldUseLegacySingleUpload(planTagRaw, files.length, existingHomePlanCount)

    const userId = session!.user!.id

    if (useLegacy) {
      const before = {
        planStoragePath: home.planStoragePath,
        planFileName: home.planFileName,
        planFileType: home.planFileType,
        planName: home.planName,
        planVariant: home.planVariant,
        planUploadedAt: home.planUploadedAt,
        planUploadedByUserId: home.planUploadedByUserId,
      }

      const result = await uploadLegacySinglePlan({
        prisma,
        home,
        homeId,
        file: files[0]!,
        planNameFromForm,
        planVariant,
        userId,
      })

      const updated = await prisma.home.findUnique({
        where: { id: homeId },
        include: { planUploadedBy: { select: { id: true, name: true } } },
      })

      await createAuditLog(
        userId,
        "Home",
        homeId,
        "HOME_PLAN_UPLOADED",
        before,
        {
          planStoragePath: updated?.planStoragePath,
          planFileName: updated?.planFileName,
          planFileType: updated?.planFileType,
          planName: updated?.planName,
          planVariant: updated?.planVariant,
          planUploadedAt: updated?.planUploadedAt,
          planUploadedByUserId: updated?.planUploadedByUserId,
        }
      )

      return NextResponse.json({
        mode: "legacy",
        planName: result.planName,
        planFileName: result.planFileName,
        planVariant: result.planVariant,
        planFileType: result.planFileType,
        planUploadedAt: result.planUploadedAt,
        uploadedBy: result.uploadedBy,
      })
    }

    const beforeMulti = { homePlanCount: existingHomePlanCount }

    const multi = await uploadMultiHomePlans({
      prisma,
      home,
      homeId,
      files,
      tag: planTagRaw,
      userId,
    })

    await createAuditLog(userId, "Home", homeId, "HOME_PLANS_UPLOADED", beforeMulti, {
      homePlanCount: existingHomePlanCount + multi.created.length,
      created: multi.created,
    })

    return NextResponse.json({
      mode: "multi",
      created: multi.created,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to upload plan"
    console.error("Error uploading home plan:", error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/homes/:homeId/plan - Update plan metadata only (Settings access required)
 */
export async function PATCH(
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

    const home = await prisma.home.findUnique({
      where: { id: homeId },
    })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const body = await request.json()
    const data = patchPlanSchema.parse(body)

    const before = {
      planName: home.planName,
      planVariant: home.planVariant,
    }

    const updateData: { planName?: string | null; planVariant?: string | null } = {}
    if (data.planName !== undefined) updateData.planName = data.planName
    if (data.planVariant !== undefined) updateData.planVariant = data.planVariant

    const updated = await prisma.home.update({
      where: { id: homeId },
      data: updateData,
    })

    await createAuditLog(
      session!.user!.id,
      "Home",
      homeId,
      "HOME_PLAN_METADATA_UPDATED",
      before,
      { planName: updated.planName, planVariant: updated.planVariant }
    )

    return NextResponse.json({
      planName: updated.planName,
      planVariant: updated.planVariant,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Error updating plan metadata:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update plan metadata" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/homes/:homeId/plan - Remove legacy floor plan file and clear Home metadata (Settings access required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { createAuditLog } = await import("@/lib/audit")
    const { createSupabaseServerClient, HOME_PLANS_BUCKET } = await import("@/lib/supabase/server")

    const { homeId } = await Promise.resolve(params)
    if (!homeId) {
      return NextResponse.json({ error: "Home ID is required" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    const authError = requireAdmin(session)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

    const home = await prisma.home.findUnique({
      where: { id: homeId },
    })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    if (!home.planStoragePath) {
      return NextResponse.json(
        { error: "No primary plan on the home record. Remove files from the plan list instead." },
        { status: 400 }
      )
    }

    const { listMergedHomePlans } = await import("@/lib/home-plans")
    const rows = await prisma.homePlan.findMany({ where: { homeId } })
    if (listMergedHomePlans(home, rows).length <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last remaining plan. Upload another plan first." },
        { status: 400 }
      )
    }

    const pathToRemove = home.planStoragePath
    const supabase = createSupabaseServerClient()
    await supabase.storage.from(HOME_PLANS_BUCKET).remove([pathToRemove])
    await prisma.homePlan.deleteMany({ where: { homeId, storagePath: pathToRemove } })

    const before = {
      planStoragePath: home.planStoragePath,
      planFileName: home.planFileName,
      planFileType: home.planFileType,
      planName: home.planName,
      planVariant: home.planVariant,
    }

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

    await createAuditLog(session!.user!.id, "Home", homeId, "HOME_PLAN_DELETED", before, null)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting home plan:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete plan" },
      { status: 500 }
    )
  }
}
