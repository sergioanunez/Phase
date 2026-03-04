import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { PLAN_CONFIG } from "@/lib/stripe"
import { getEntitlementAccess } from "@/lib/billing/entitlementAccess"
import { stripe } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const stripeMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test") ? "test" : "live"
const dashboardBase =
  stripeMode === "test" ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com"

/**
 * GET /api/super-admin/companies/:companyId/billing-debug
 * Billing debug payload: entitlement, Stripe snapshot, manual override. SUPER_ADMIN only.
 * Uses same source-of-truth as tenant /api/billing.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const { prisma } = await import("@/lib/prisma")
    const check = await requireSuperAdmin()
    if ("error" in check) return check.error

    const { companyId } = await params
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        planKey: true,
        status: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        renewalDate: true,
        notes: true,
      },
    })
    if (!company)
      return NextResponse.json({ error: "Company not found" }, { status: 404 })

    const [entitlement, lastWebhook] = await Promise.all([
      getEntitlementAccess(prisma, companyId),
      prisma.subscriptionEventLog.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        select: { eventType: true, createdAt: true },
      }),
    ])

    const planName =
      company.planKey && company.planKey in PLAN_CONFIG
        ? PLAN_CONFIG[company.planKey as keyof typeof PLAN_CONFIG].label
        : company.planKey ?? "No plan"

    let stripeSnapshot: {
      mode: "test" | "live"
      customerId: string | null
      subscriptionId: string | null
      subscriptionStatus: string | null
      currentPeriodEnd: string | null
      cancelAtPeriodEnd: boolean | null
      priceId: string | null
      productId: string | null
      latestInvoiceStatus: string | null
      hostedInvoiceUrl: string | null
      lastWebhook: { type: string; receivedAt: string } | null
      lastSync: { syncedAt: string; result: "ok" | "error"; message?: string } | null
      stripeDashboardUrls: { customer?: string; subscription?: string; invoice?: string }
    } = {
      mode: stripeMode,
      customerId: company.stripeCustomerId,
      subscriptionId: company.stripeSubscriptionId,
      subscriptionStatus: company.subscriptionStatus ?? null,
      currentPeriodEnd: company.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: null,
      priceId: null,
      productId: null,
      latestInvoiceStatus: null,
      hostedInvoiceUrl: null,
      lastWebhook: lastWebhook
        ? { type: lastWebhook.eventType, receivedAt: lastWebhook.createdAt.toISOString() }
        : null,
      lastSync: null,
      stripeDashboardUrls: {},
    }

    if (company.stripeCustomerId)
      stripeSnapshot.stripeDashboardUrls.customer = `${dashboardBase}/customers/${company.stripeCustomerId}`

    if (stripe && company.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId, {
          expand: ["items.data.price", "latest_invoice"],
        })
        stripeSnapshot.cancelAtPeriodEnd = sub.cancel_at_period_end ?? null
        stripeSnapshot.currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : stripeSnapshot.currentPeriodEnd
        const item = sub.items?.data?.[0]
        const price = item?.price
        if (price) {
          const p = typeof price === "object" ? price : null
          stripeSnapshot.priceId = p?.id ?? null
          stripeSnapshot.productId = typeof p?.product === "string" ? p.product : p?.product?.id ?? null
        }
        const inv = sub.latest_invoice
        if (inv && typeof inv === "object" && "status" in inv) {
          stripeSnapshot.latestInvoiceStatus = (inv as { status: string }).status ?? null
          stripeSnapshot.hostedInvoiceUrl =
            (inv as { hosted_invoice_url?: string }).hosted_invoice_url ?? null
        }
        stripeSnapshot.stripeDashboardUrls.subscription = `${dashboardBase}/subscriptions/${company.stripeSubscriptionId}`
        if (inv && typeof inv === "object" && "id" in inv)
          stripeSnapshot.stripeDashboardUrls.invoice = `${dashboardBase}/invoices/${(inv as { id: string }).id}`
      } catch (e) {
        // subscription may be deleted in Stripe
        stripeSnapshot.subscriptionStatus = company.subscriptionStatus
      }
    }

    const manual = {
      overrideActive: company.status === "ACTIVE",
      overrideUntil: company.renewalDate?.toISOString() ?? null,
      notes: company.notes ?? null,
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name, planName },
      entitlement: {
        access: entitlement.access,
        reason: entitlement.reason,
        limitedCapabilities: entitlement.limitedCapabilities,
        evaluatedAt: entitlement.evaluatedAt,
      },
      stripe: stripeSnapshot,
      manual,
    })
  } catch (err) {
    console.error("GET billing-debug error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load billing debug" },
      { status: 500 }
    )
  }
}
