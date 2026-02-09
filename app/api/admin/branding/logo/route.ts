import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { getSupabaseServerClient, COMPANY_ASSETS_BUCKET } from "@/lib/supabase-server"
import { handleApiError } from "@/lib/api-response"

const MAX_SIZE = 1024 * 1024 // 1 MB
const ALLOWED_TYPES = ["image/svg+xml", "image/png"]

function getExt(mime: string, filename: string): string {
  if ((mime || "").toLowerCase().includes("svg")) return ".svg"
  if ((mime || "").toLowerCase().includes("png")) return ".png"
  const ext = filename.split(".").pop()?.toLowerCase()
  if (ext === "svg" || ext === "png") return `.${ext}`
  return ".png"
}

/**
 * POST /api/admin/branding/logo
 * Upload company logo (WHITE_LABEL, Admin only). Stores path in Company.brandLogoPath.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.role !== "Admin") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { companyId: true },
    })
    if (!user?.companyId) {
      return NextResponse.json({ error: "No company assigned" }, { status: 403 })
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { id: true, pricingTier: true, brandLogoPath: true },
    })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }
    if (company.pricingTier !== "WHITE_LABEL") {
      return NextResponse.json(
        { error: "White label features are only available for White Label tier." },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file || !file.size) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Logo must be 1 MB or smaller" }, { status: 400 })
    }

    const mime = (file.type || "").toLowerCase()
    if (!ALLOWED_TYPES.some((t) => mime.includes(t.replace("image/", "")))) {
      return NextResponse.json(
        { error: "Invalid type. Use SVG or PNG only." },
        { status: 400 }
      )
    }

    const ext = getExt(file.type, file.name)
    const storagePath = `companies/${company.id}/branding/logo${ext}`

    const supabase = getSupabaseServerClient()
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(COMPANY_ASSETS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error("Branding logo upload error:", uploadError)
      return NextResponse.json(
        { error: uploadError.message || "Failed to upload logo" },
        { status: 500 }
      )
    }

    const beforePath = company.brandLogoPath
    await prisma.company.update({
      where: { id: company.id },
      data: { brandLogoPath: storagePath },
    })

    await createAuditLog(
      session.user.id,
      "Company",
      company.id,
      "COMPANY_LOGO_UPDATED",
      { brandLogoPath: beforePath },
      { brandLogoPath: storagePath },
      company.id
    )

    return NextResponse.json({ brandLogoPath: storagePath })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/admin/branding/logo
 * Remove uploaded logo (clear path; fallback to Phase logo).
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.role !== "Admin") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { companyId: true },
    })
    if (!user?.companyId) {
      return NextResponse.json({ error: "No company assigned" }, { status: 403 })
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { id: true, pricingTier: true, brandLogoPath: true },
    })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }
    if (company.pricingTier !== "WHITE_LABEL") {
      return NextResponse.json(
        { error: "White label features are only available for White Label tier." },
        { status: 403 }
      )
    }

    const beforePath = company.brandLogoPath
    if (beforePath) {
      const supabase = getSupabaseServerClient()
      await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([beforePath])
    }

    await prisma.company.update({
      where: { id: company.id },
      data: { brandLogoPath: null },
    })

    await createAuditLog(
      session.user.id,
      "Company",
      company.id,
      "COMPANY_LOGO_REMOVED",
      { brandLogoPath: beforePath },
      null,
      company.id
    )

    return NextResponse.json({ brandLogoPath: null })
  } catch (error) {
    return handleApiError(error)
  }
}
