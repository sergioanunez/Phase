import { NextRequest, NextResponse } from "next/server"
import { PlanFileType } from "@prisma/client"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]
const ALLOWED_PDF = "application/pdf"

function requireAdmin(session: any) {
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 as const }
  }
  if (session.user.role !== "Admin") {
    return { error: "Forbidden: Admin only", status: 403 as const }
  }
  return null
}

const SAFE_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"] as const

function getExtension(filename: string, mimeType: string): string {
  const mt = (mimeType || "").toLowerCase().trim()
  if (mt === "application/pdf") return ".pdf"
  if (mt === "image/png") return ".png"
  if (mt === "image/jpeg" || mt === "image/jpg") return ".jpg"
  if (mt === "image/webp") return ".webp"
  const fromFile = filename.split(".").pop()?.toLowerCase()?.trim()
  if (fromFile === "pdf") return ".pdf"
  if (fromFile === "png") return ".png"
  if (fromFile === "jpg" || fromFile === "jpeg") return ".jpg"
  if (fromFile === "webp") return ".webp"
  return ".jpg"
}

const patchPlanSchema = z.object({
  planName: z.string().optional().nullable(),
  planVariant: z.string().optional().nullable(),
})

/**
 * POST /api/admin/homes/:homeId/plan - Upload or replace floor plan (Admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
    if (isBuild()) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { createAuditLog } = await import("@/lib/audit")
    const { createSupabaseServerClient, HOME_PLANS_BUCKET } = await import("@/lib/supabase/server")

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
    const file = formData.get("file") as File | null
    const planNameFromForm = (formData.get("planName") as string)?.trim() || null
    const planVariant = (formData.get("planVariant") as string) || null

    if (!file || !file.size) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 20 MB limit" }, { status: 400 })
    }

    const mimeType = file.type?.toLowerCase() || ""
    const isPdf = mimeType === ALLOWED_PDF
    const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType)
    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: "Invalid file type. Use PDF or image (PNG, JPEG, WebP)." },
        { status: 400 }
      )
    }

    let ext = getExtension(file.name, mimeType)
    if (![".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) ext = ".jpg"
    // Plan name is independent: only update when user sends one in form; otherwise keep existing
    const planName =
      planNameFromForm != null && planNameFromForm !== ""
        ? planNameFromForm
        : home.planName
    // File name is independent: always set from uploaded file (for display only)
    const planFileName =
      file.name?.replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "").trim() ||
      file.name ||
      null
    const storagePath = `homes/${homeId}/floorplan${ext}`
    const planFileType: PlanFileType = isPdf ? "PDF" : "IMAGE"

    const supabase = createSupabaseServerClient()
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(HOME_PLANS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error("Supabase upload error:", uploadError)
      return NextResponse.json(
        { error: uploadError.message || "Failed to upload plan" },
        { status: 500 }
      )
    }

    const before = {
      planStoragePath: home.planStoragePath,
      planFileName: home.planFileName,
      planFileType: home.planFileType,
      planName: home.planName,
      planVariant: home.planVariant,
      planUploadedAt: home.planUploadedAt,
      planUploadedByUserId: home.planUploadedByUserId,
    }

    const updated = await prisma.home.update({
      where: { id: homeId },
      data: {
        planStoragePath: storagePath,
        planFileName,
        planFileType,
        planName,
        planVariant: planVariant ?? home.planVariant,
        planUploadedAt: new Date(),
        planUploadedByUserId: session!.user!.id,
      },
      include: {
        planUploadedBy: { select: { id: true, name: true } },
      },
    })

    await createAuditLog(
      session!.user!.id,
      "Home",
      homeId,
      "HOME_PLAN_UPLOADED",
      before,
      {
        planStoragePath: updated.planStoragePath,
        planFileName: updated.planFileName,
        planFileType: updated.planFileType,
        planName: updated.planName,
        planVariant: updated.planVariant,
        planUploadedAt: updated.planUploadedAt,
        planUploadedByUserId: updated.planUploadedByUserId,
      }
    )

    return NextResponse.json({
      planName: updated.planName,
      planFileName: updated.planFileName,
      planVariant: updated.planVariant,
      planFileType: updated.planFileType,
      planUploadedAt: updated.planUploadedAt,
      uploadedBy: updated.planUploadedBy,
    })
  } catch (error: any) {
    console.error("Error uploading home plan:", error)
    return NextResponse.json(
      { error: error.message || "Failed to upload plan" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/homes/:homeId/plan - Update plan metadata only (Admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
    if (isBuild()) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
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
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error("Error updating plan metadata:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update plan metadata" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/homes/:homeId/plan - Remove plan file and clear metadata (Admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
    if (isBuild()) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
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

    if (home.planStoragePath) {
      const supabase = createSupabaseServerClient()
      await supabase.storage
        .from(HOME_PLANS_BUCKET)
        .remove([home.planStoragePath])
    }

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

    await createAuditLog(
      session!.user!.id,
      "Home",
      homeId,
      "HOME_PLAN_DELETED",
      before,
      null
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting home plan:", error)
    return NextResponse.json(
      { error: error.message || "Failed to delete plan" },
      { status: 500 }
    )
  }
}
