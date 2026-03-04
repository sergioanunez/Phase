import { NextResponse } from "next/server"
import Stripe from "stripe"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { stripe, WHITE_LABEL_PRICE_ID } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/billing/white-label/enable
 * Enables the White Label add-on for the current tenant by attaching the
 * White Label price to the existing Stripe subscription.
 */
export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    if (!stripe || !WHITE_LABEL_PRICE_ID) {
      return NextResponse.json({ error: "White label billing is not configured" }, { status: 503 })
    }

    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("users:write")

    const company = await prisma.company.findFirst({
      where: { id: ctx.companyId },
      select: {
        id: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        pricingTier: true,
        entitlementsJson: true,
      },
    })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }
    if (!company.stripeCustomerId || !company.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "Active subscription required before enabling White Label." },
        { status: 400 }
      )
    }

    // Check current subscription items for existing White Label price.
    const sub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId, {
      expand: ["items.data.price"],
    })
    const hasItem =
      sub.items.data ?? ([] as Stripe.SubscriptionItem[])
    const alreadyEnabled = hasItem.some((item) => {
      const price = item.price
      const priceId = typeof price === "string" ? price : (price as Stripe.Price | undefined)?.id
      return priceId === WHITE_LABEL_PRICE_ID
    })

    if (!alreadyEnabled) {
      // Attach White Label price as a separate subscription item.
      await stripe.subscriptionItems.create({
        subscription: sub.id,
        price: WHITE_LABEL_PRICE_ID,
        quantity: 1,
      })
    }

    const currentEntitlements =
      company.entitlementsJson && typeof company.entitlementsJson === "object"
        ? (company.entitlementsJson as Record<string, unknown>)
        : {}

    await prisma.company.update({
      where: { id: company.id },
      data: {
        pricingTier: "WHITE_LABEL",
        entitlementsJson: {
          ...currentEntitlements,
          whiteLabelEnabled: true,
        },
      },
    })

    return NextResponse.json({ enabled: true })
  } catch (error: any) {
    console.error("POST /api/billing/white-label/enable error:", error)
    if (error?.message === "Unauthorized" || error?.message === "Forbidden") {
      return NextResponse.json(
        { error: error.message },
        { status: error?.message === "Unauthorized" ? 401 : 403 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to enable White Label" },
      { status: 500 }
    )
  }
}

