import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const updateBrandingSchema = z.object({
  brandAppName: z.string().optional().nullable(),
  brandLogoUrl: z.union([z.string().url(), z.literal("")]).optional().nullable(),
  brandPrimaryColor: z.string().optional().nullable(),
  brandAccentColor: z.string().optional().nullable(),
})

async function getPublicUrlForPath(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const { createSupabaseServerClient, COMPANY_ASSETS_BUCKET } = await import("@/lib/supabase/server")
    const supabase = createSupabaseServerClient()
    const { data } = supabase.storage.from(COMPANY_ASSETS_BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
}

/**
 * GET /api/company/branding
 * Returns the current tenant company's branding fields and pricing tier.
 * Includes logoUrl/faviconUrl derived from storage paths when set.
 */
export async function GET() {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const ctx = await requireTenantContext()
    const company = await prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: {
        pricingTier: true,
        name: true,
        brandAppName: true,
        brandLogoUrl: true,
        brandLogoPath: true,
        brandFaviconPath: true,
        brandPrimaryColor: true,
        brandAccentColor: true,
        updatedAt: true,
      },
    })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }
    const logoUrl =
      (await getPublicUrlForPath(company.brandLogoPath)) || (company.brandLogoUrl || null)
    const faviconUrl = await getPublicUrlForPath(company.brandFaviconPath)
    return NextResponse.json({
      ...company,
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || null,
      brandingUpdatedAt: company.updatedAt,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/company/branding
 * Updates branding for the current tenant company. Only allowed when company pricing tier is WHITE_LABEL.
 */
export async function PATCH(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { requireTenantContext } = await import("@/lib/tenant")
    await requireTenantPermission("users:write")
    const ctx = await requireTenantContext()
    const company = await prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { id: true, pricingTier: true },
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
    const body = await request.json()
    const parsed = updateBrandingSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const data = parsed.data
    const updatePayload: {
      brandAppName?: string | null
      brandLogoUrl?: string | null
      brandPrimaryColor?: string | null
      brandAccentColor?: string | null
    } = {}
    if (data.brandAppName !== undefined) updatePayload.brandAppName = data.brandAppName || null
    if (data.brandLogoUrl !== undefined) updatePayload.brandLogoUrl = data.brandLogoUrl || null
    if (data.brandPrimaryColor !== undefined) updatePayload.brandPrimaryColor = data.brandPrimaryColor || null
    if (data.brandAccentColor !== undefined) updatePayload.brandAccentColor = data.brandAccentColor || null
    const updated = await prisma.company.update({
      where: { id: ctx.companyId },
      data: updatePayload,
      select: {
        brandAppName: true,
        brandLogoUrl: true,
        brandPrimaryColor: true,
        brandAccentColor: true,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
