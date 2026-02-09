import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { getSupabaseServerClient, COMPANY_ASSETS_BUCKET } from "@/lib/supabase-server"
import { handleApiError } from "@/lib/api-response"

const MAX_SIZE = 300 * 1024 // 300 KB
const ALLOWED_TYPES = ["image/png"]

/**
 * POST /api/admin/branding/favicon
 * Upload company favicon (WHITE_LABEL, Admin only). Stores path in Company.brandFaviconPath.
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
      select: { id: true, pricingTier: true, brandFaviconPath: true },
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
      return NextResponse.json({ error: "Favicon must be 300 KB or smaller" }, { status: 400 })
    }

    const mime = (file.type || "").toLowerCase()
    if (!mime.includes("png")) {
      return NextResponse.json({ error: "Favicon must be PNG" }, { status: 400 })
    }

    const storagePath = `companies/${company.id}/branding/favicon.png`

    const supabase = getSupabaseServerClient()
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(COMPANY_ASSETS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: "image/png",
        upsert: true,
      })

    if (uploadError) {
      console.error("Branding favicon upload error:", uploadError)
      return NextResponse.json(
        { error: uploadError.message || "Failed to upload favicon" },
        { status: 500 }
      )
    }

    const beforePath = company.brandFaviconPath
    await prisma.company.update({
      where: { id: company.id },
      data: { brandFaviconPath: storagePath },
    })

    await createAuditLog(
      session.user.id,
      "Company",
      company.id,
      "COMPANY_FAVICON_UPDATED",
      { brandFaviconPath: beforePath },
      { brandFaviconPath: storagePath },
      company.id
    )

    return NextResponse.json({ brandFaviconPath: storagePath })
  } catch (error) {
    return handleApiError(error)
  }
}
