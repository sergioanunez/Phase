import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"
import { getServerAppUrl } from "@/lib/env"
import { stripe, PLAN_CONFIG, type PlanKey } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const checkoutSchema = z.object({ planKey: z.enum(["starter", "growth", "scale"]) })

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout session for the current tenant. Returns { url }.
 * Tenant admin only.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    if (!stripe) {
      return NextResponse.json({ error: "Billing is not configured" }, { status: 503 })
    }
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("users:write")
    const body = await request.json()
    const { planKey } = checkoutSchema.parse(body) as { planKey: PlanKey }

    const plan = PLAN_CONFIG[planKey]
    if (!plan?.stripePriceId) {
      return NextResponse.json({ error: `Plan ${planKey} is not configured` }, { status: 400 })
    }

    const company = await prisma.company.findFirst({
      where: { id: ctx.companyId },
      select: { id: true, name: true, stripeCustomerId: true },
    })
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

    const baseUrl = getServerAppUrl()
    let customerId = company.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        metadata: { companyId: company.id },
      })
      customerId = customer.id
      await prisma.company.update({
        where: { id: company.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/admin/billing`,
      subscription_data: {
        metadata: { companyId: company.id },
      },
      metadata: { companyId: company.id },
      allow_promotion_codes: true,
    })

    const url = session.url
    if (!url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 })
    }
    return NextResponse.json({ url })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors.map((x) => x.message).join(", ") }, { status: 400 })
    }
    console.error("POST /api/billing/checkout error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout failed" },
      { status: 500 }
    )
  }
}
