import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { getServerAppUrl } from "@/lib/env"
import { stripe } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session. Returns { url }.
 * Tenant admin only.
 */
export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    if (!stripe) {
      return NextResponse.json({ error: "Billing is not configured" }, { status: 503 })
    }
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("users:write")

    const company = await prisma.company.findFirst({
      where: { id: ctx.companyId },
      select: { stripeCustomerId: true },
    })
    if (!company?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found. Subscribe to a plan first." },
        { status: 400 }
      )
    }

    const baseUrl = getServerAppUrl()
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${baseUrl}/admin/billing`,
    })

    const url = session.url
    if (!url) {
      return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 })
    }
    return NextResponse.json({ url })
  } catch (e) {
    console.error("POST /api/billing/portal error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Portal failed" },
      { status: 500 }
    )
  }
}
