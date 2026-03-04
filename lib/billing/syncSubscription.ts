import type { PrismaClient } from "@prisma/client"
import Stripe from "stripe"
import { stripe, getPlanByPriceId, entitlementsFromPlan, WHITE_LABEL_PRICE_ID } from "@/lib/stripe"

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

export type SyncResult = { ok: true } | { ok: false; reason: string; message?: string }

/**
 * Same logic as /api/billing/sync. Syncs Stripe subscription for a company into the DB.
 * Caller must ensure stripe is configured and company has stripeCustomerId.
 */
export async function syncCompanySubscription(
  prisma: PrismaClient,
  companyId: string
): Promise<SyncResult> {
  if (!stripe) return { ok: false, reason: "stripe_not_configured" }

  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: { id: true, stripeCustomerId: true },
  })
  if (!company?.stripeCustomerId)
    return { ok: false, reason: "no_customer", message: "Company has no Stripe customer ID" }

  try {
    const list = await stripe.subscriptions.list({
      customer: company.stripeCustomerId,
      status: "active",
      limit: 1,
    })
    let sub = list.data[0]
    if (!sub) {
      const trialing = await stripe.subscriptions.list({
        customer: company.stripeCustomerId,
        status: "trialing",
        limit: 1,
      })
      sub = trialing.data[0]
    }
    if (!sub) return { ok: false, reason: "no_subscription", message: "No active or trialing subscription in Stripe" }

    const expanded =
      sub.items?.data?.[0]?.price && typeof sub.items.data[0].price === "object"
        ? sub
        : await stripe.subscriptions.retrieve(sub.id, { expand: ["items.data.price"] })

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
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed"
    return { ok: false, reason: "error", message }
  }
}
