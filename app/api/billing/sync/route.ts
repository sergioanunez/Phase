import { NextResponse } from "next/server"
import Stripe from "stripe"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { stripe, getPlanByPriceId, entitlementsFromPlan, WHITE_LABEL_PRICE_ID } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function mapStripeStatus(stripeStatus: string): "ACTIVE" | "TRIAL" | "PAST_DUE" | "DISABLED" {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE"
    case "trialing":
      return "TRIAL"
    case "past_due":
    case "unpaid":
      return "PAST_DUE"
    default:
      return "DISABLED"
  }
}

/**
 * POST /api/billing/sync
 * Syncs the current tenant's subscription from Stripe into the DB.
 * Call after checkout success redirect so the UI shows the plan even if the webhook hasn't run yet.
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
      select: { id: true, stripeCustomerId: true },
    })
    if (!company?.stripeCustomerId) {
      return NextResponse.json({ synced: false, reason: "no_customer" })
    }

    const list = await stripe.subscriptions.list({
      customer: company.stripeCustomerId,
      status: "active",
      limit: 1,
    })
    const subStripe = list.data[0]
    if (!subStripe) {
      // trialing subscription might not be "active"
      const trialing = await stripe.subscriptions.list({
        customer: company.stripeCustomerId,
        status: "trialing",
        limit: 1,
      })
      const sub = trialing.data[0]
      if (!sub) return NextResponse.json({ synced: false, reason: "no_subscription" })
      await applySub(prisma, sub, company.id)
      return NextResponse.json({ synced: true })
    }
    await applySub(prisma, subStripe, company.id)
    return NextResponse.json({ synced: true })
  } catch (e) {
    console.error("POST /api/billing/sync error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    )
  }
}

async function applySub(
  prisma: { company: { update: any } },
  sub: Stripe.Subscription,
  companyId: string
) {
  const expanded =
    sub.items?.data?.[0]?.price && typeof sub.items.data[0].price === "object"
      ? sub
      : await stripe!.subscriptions.retrieve(sub.id, { expand: ["items.data.price"] })

  const items = expanded.items?.data ?? []
  const firstItemPrice = items[0]?.price
  const firstPriceId =
    typeof firstItemPrice === "string" ? firstItemPrice : (firstItemPrice as Stripe.Price | undefined)?.id
  const plan = firstPriceId ? getPlanByPriceId(firstPriceId) : null

  const hasWhiteLabelAddOn =
    !!WHITE_LABEL_PRICE_ID &&
    items.some((item) => {
      const price = item.price
      const priceId = typeof price === "string" ? price : (price as Stripe.Price | undefined)?.id
      return priceId === WHITE_LABEL_PRICE_ID
    })

  const baseEntitlements = plan ? entitlementsFromPlan(plan) : null
  const entitlements =
    baseEntitlements || hasWhiteLabelAddOn
      ? {
          ...(baseEntitlements ?? {}),
          whiteLabelEnabled: (baseEntitlements?.whiteLabelEnabled ?? false) || hasWhiteLabelAddOn,
        }
      : null

  const status = mapStripeStatus(expanded.status)
  await prisma.company.update({
    where: { id: companyId },
    data: {
      stripeSubscriptionId: expanded.id,
      subscriptionStatus: expanded.status,
      planKey: plan?.planKey ?? null,
      currentPeriodEnd: expanded.current_period_end
        ? new Date(expanded.current_period_end * 1000)
        : null,
      entitlementsJson: entitlements ?? undefined,
      pricingTier: hasWhiteLabelAddOn ? "WHITE_LABEL" : undefined,
      status,
      billingStatus: status === "PAST_DUE" ? "PAST_DUE" : "OK",
    },
  })
}
