import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const MAX_SIZE = 300 * 1024 // 300 KB

/**
 * POST /api/admin/branding/favicon
 * Upload company favicon (WHITE_LABEL, Admin only). Stores path in Company.brandFaviconPath.
 */
export async function POST(request: NextRequest) {
  try {
    if (process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { createAuditLog } = await import("@/lib/audit")
    const { getSupabaseServerClient, COMPANY_ASSETS_BUCKET } = await import("@/lib/supabase-server")
    const { handleApiError } = await import("@/lib/api-response")

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
  } catch (error: any) {
    if (process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
    try {
      const { handleApiError } = await import("@/lib/api-response")
      return handleApiError(error)
    } catch (_) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
