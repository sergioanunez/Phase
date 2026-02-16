import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { stripe, STRIPE_WEBHOOK_SECRET, getPlanByPriceId, entitlementsFromPlan } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Next.js App Router: consume body once as text for signature verification
export async function POST(request: NextRequest) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.warn("[stripe webhook] Stripe or webhook secret not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  let event: Stripe.Event
  const rawBody = await request.text()
  const sig = request.headers.get("stripe-signature")
  if (!sig) {
    console.warn("[stripe webhook] Missing stripe-signature header")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.warn("[stripe webhook] Signature verification failed:", err?.message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const { prisma } = await import("@/lib/prisma")

  // Idempotency: skip if we already processed this event
  const existing = await prisma.subscriptionEventLog.findUnique({
    where: { stripeEventId: event.id },
  })
  if (existing) {
    console.log("[stripe webhook] Duplicate event ignored:", event.id)
    return NextResponse.json({ received: true })
  }

  await prisma.subscriptionEventLog.create({
    data: {
      stripeEventId: event.id,
      eventType: event.type,
      payload: event as unknown as object,
    },
  })

  const eventId = event.id
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session
      await handleCheckoutCompleted(prisma, session, eventId)
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object as Stripe.Subscription
      await handleSubscriptionUpsert(prisma, sub, eventId)
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription
      await handleSubscriptionDeleted(prisma, sub)
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice
      await handleInvoicePaymentFailed(prisma, invoice)
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice
      await handleInvoicePaid(prisma, invoice)
    } else {
      console.log("[stripe webhook] Unhandled event type:", event.type)
    }
  } catch (err) {
    console.error("[stripe webhook] Processing error:", err)
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    )
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(
  prisma: { company: { update: any }; subscriptionEventLog: { update: any } },
  session: Stripe.Checkout.Session,
  eventId: string
) {
  const companyId = session.metadata?.companyId
  if (!companyId || !session.subscription) {
    console.warn("[stripe webhook] checkout.session.completed missing companyId or subscription")
    return
  }
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id
  await prisma.subscriptionEventLog.update({
    where: { stripeEventId: eventId },
    data: { companyId },
  })
  const sub = await stripe!.subscriptions.retrieve(subId, { expand: ["items.data.price"] })
  await applySubscriptionToCompany(prisma, sub, companyId)
  console.log("[stripe webhook] checkout.session.completed applied for company", companyId)
}

async function handleSubscriptionUpsert(
  prisma: { company: { findFirst: any; update: any } },
  sub: Stripe.Subscription,
  eventId: string
) {
  const companyId = sub.metadata?.companyId
  let targetId: string | null = companyId
  if (!targetId) {
    const custId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
    const company = await prisma.company.findFirst({
      where: { stripeCustomerId: custId },
      select: { id: true },
    })
    targetId = company?.id ?? null
  }
  if (!targetId) {
    console.warn("[stripe webhook] subscription created/updated: no company for customer")
    return
  }
  await prisma.subscriptionEventLog.update({
    where: { stripeEventId: eventId },
    data: { companyId: targetId },
  })
  await applySubscriptionToCompany(prisma, sub, targetId)
  console.log("[stripe webhook] customer.subscription upserted for company", targetId)
}

async function handleSubscriptionDeleted(
  prisma: { company: { findFirst: any; update: any } },
  sub: Stripe.Subscription
) {
  const companyId = sub.metadata?.companyId
  let id = companyId
  if (!id) {
    const custId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
    const company = await prisma.company.findFirst({
      where: { stripeCustomerId: custId },
      select: { id: true },
    })
    id = company?.id ?? null
  }
  if (!id) {
    console.warn("[stripe webhook] subscription deleted: no company found")
    return
  }
  await prisma.company.update({
    where: { id },
    data: {
      stripeSubscriptionId: null,
      subscriptionStatus: "canceled",
      planKey: null,
      currentPeriodEnd: null,
      entitlementsJson: null,
      status: "DISABLED",
      billingStatus: "CANCELED",
    },
  })
  console.log("[stripe webhook] customer.subscription.deleted applied for company", id)
}

async function handleInvoicePaymentFailed(
  prisma: { company: { findFirst: any; update: any } },
  invoice: Stripe.Invoice
) {
  const subId = invoice.subscription as string | null
  if (!subId) return
  const company = await prisma.company.findFirst({
    where: { stripeSubscriptionId: subId },
    select: { id: true },
  })
  if (company) {
    await prisma.company.update({
      where: { id: company.id },
      data: { status: "PAST_DUE", billingStatus: "PAST_DUE" },
    })
    console.log("[stripe webhook] invoice.payment_failed -> PAST_DUE for company", company.id)
  }
}

async function handleInvoicePaid(
  prisma: { company: { findFirst: any; update: any } },
  _invoice: Stripe.Invoice
) {
  // Optional: ensure status is ACTIVE when payment succeeds
  // Subscription update already sets status; we could reset PAST_DUE here if needed.
}

async function applySubscriptionToCompany(
  prisma: { company: { update: any } },
  sub: Stripe.Subscription,
  companyId: string
) {
  const priceId =
    sub.items?.data?.[0]?.price?.id ??
    (sub.items?.data?.[0] as any)?.price?.id
  const plan = getPlanByPriceId(priceId)
  const entitlements = plan ? entitlementsFromPlan(plan) : null
  const status = mapStripeStatusToCompanyStatus(sub.status)
  await prisma.company.update({
    where: { id: companyId },
    data: {
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planKey: plan?.planKey ?? null,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      entitlementsJson: entitlements ?? undefined,
      status,
      billingStatus: status === "PAST_DUE" ? "PAST_DUE" : "OK",
    },
  })
}

function mapStripeStatusToCompanyStatus(stripeStatus: string): "ACTIVE" | "TRIAL" | "PAST_DUE" | "DISABLED" {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE"
    case "trialing":
      return "TRIAL"
    case "past_due":
    case "unpaid":
      return "PAST_DUE"
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    default:
      return "ACTIVE"
  }
}
