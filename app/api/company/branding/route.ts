import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantContext } from "@/lib/tenant"
import { requireTenantPermission } from "@/lib/rbac"
import { handleApiError } from "@/lib/api-response"
import { getSupabaseServerClient, COMPANY_ASSETS_BUCKET } from "@/lib/supabase-server"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updateBrandingSchema = z.object({
  brandAppName: z.string().optional().nullable(),
  brandLogoUrl: z.union([z.string().url(), z.literal("")]).optional().nullable(),
  brandPrimaryColor: z.string().optional().nullable(),
  brandAccentColor: z.string().optional().nullable(),
})

function getPublicUrlForPath(path: string | null): string | null {
  if (!path) return null
  try {
    const supabase = getSupabaseServerClient()
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
      getPublicUrlForPath(company.brandLogoPath) || (company.brandLogoUrl || null)
    const faviconUrl = getPublicUrlForPath(company.brandFaviconPath)
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
