import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { getSupabaseServerClient, HOME_PLANS_BUCKET } from "@/lib/supabase-server"

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]

function requireAdmin(session: unknown) {
  if (!session || typeof session !== "object" || !("user" in session)) {
    return { error: "Unauthorized", status: 401 as const }
  }
  const user = (session as { user?: { role?: string } }).user
  if (user?.role !== "Admin") {
    return { error: "Forbidden: Admin only", status: 403 as const }
  }
  return null
}

function getExtension(filename: string, mimeType: string): string {
  const mt = (mimeType || "").toLowerCase().trim()
  if (mt === "image/png") return ".png"
  if (mt === "image/jpeg" || mt === "image/jpg") return ".jpg"
  if (mt === "image/webp") return ".webp"
  const fromFile = filename.split(".").pop()?.toLowerCase()?.trim()
  if (fromFile === "png") return ".png"
  if (fromFile === "jpg" || fromFile === "jpeg") return ".jpg"
  if (fromFile === "webp") return ".webp"
  return ".jpg"
}

/**
 * POST /api/admin/homes/:homeId/thumbnail - Upload or replace house thumbnail (Admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
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

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file || !file.size) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Thumbnail must be under 2 MB" }, { status: 400 })
    }

    const mimeType = file.type?.toLowerCase() || ""
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Invalid file type. Use PNG, JPEG, or WebP image." },
        { status: 400 }
      )
    }

    let ext = getExtension(file.name, mimeType)
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) ext = ".jpg"
    const storagePath = `homes/${homeId}/thumbnail${ext}`

    // Keep original filename (without extension) for display
    const thumbnailFileName =
      file.name?.replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "").trim() ||
      file.name ||
      null

    const supabase = getSupabaseServerClient()
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(HOME_PLANS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error("Supabase thumbnail upload error:", uploadError)
      return NextResponse.json(
        { error: uploadError.message || "Failed to upload thumbnail" },
        { status: 500 }
      )
    }

    const before = {
      thumbnailStoragePath: home.thumbnailStoragePath,
      thumbnailFileName: home.thumbnailFileName,
    }

    await prisma.home.update({
      where: { id: homeId },
      data: { thumbnailStoragePath: storagePath, thumbnailFileName },
    })

    await createAuditLog(
      (session as { user: { id: string } }).user.id,
      "Home",
      homeId,
      "HOME_THUMBNAIL_UPLOADED",
      before,
      { thumbnailStoragePath: storagePath, thumbnailFileName }
    )

    return NextResponse.json({ success: true, thumbnailFileName })
  } catch (error: unknown) {
    console.error("Error uploading home thumbnail:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload thumbnail" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/homes/:homeId/thumbnail - Remove thumbnail (Admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
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

    if (home.thumbnailStoragePath) {
      const supabase = getSupabaseServerClient()
      await supabase.storage
        .from(HOME_PLANS_BUCKET)
        .remove([home.thumbnailStoragePath])
    }

    const before = {
      thumbnailStoragePath: home.thumbnailStoragePath,
      thumbnailFileName: home.thumbnailFileName,
    }

    await prisma.home.update({
      where: { id: homeId },
      data: { thumbnailStoragePath: null, thumbnailFileName: null },
    })

    await createAuditLog(
      (session as { user: { id: string } }).user.id,
      "Home",
      homeId,
      "HOME_THUMBNAIL_DELETED",
      before,
      null
    )

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting home thumbnail:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete thumbnail" },
      { status: 500 }
    )
  }
}
