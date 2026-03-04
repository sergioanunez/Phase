import type { PrismaClient } from "@prisma/client"

export type AccessStatus = "ACTIVE" | "LIMITED"

export type EntitlementReason =
  | "TRIAL_ACTIVE"
  | "SUB_ACTIVE"
  | "PAST_DUE"
  | "NO_SUB"
  | "MANUAL_OVERRIDE"
  | "GRACE"
  | "CANCELED"
  | "INCOMPLETE"

export type EntitlementAccessResult = {
  access: AccessStatus
  reason: EntitlementReason
  limitedCapabilities: string[]
  evaluatedAt: string
}

const LIMITED_CAPABILITIES = [
  "schedule_tasks",
  "create_punchlists",
  "create_homes",
  "create_subdivisions",
]

/**
 * Same source-of-truth as tenant billing / getBillingGates.
 * Returns access status and reason code for a company.
 */
export async function getEntitlementAccess(
  prisma: PrismaClient,
  companyId: string
): Promise<EntitlementAccessResult> {
  const evaluatedAt = new Date().toISOString()
  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: {
      status: true,
      subscriptionStatus: true,
      trialStartsAt: true,
      trialEndsAt: true,
      stripeSubscriptionId: true,
    },
  })

  if (!company) {
    return {
      access: "LIMITED",
      reason: "NO_SUB",
      limitedCapabilities: LIMITED_CAPABILITIES,
      evaluatedAt,
    }
  }

  const subscriptionStatus = company.subscriptionStatus ?? null
  const isTrialing = company.status === "TRIAL" || subscriptionStatus === "trialing"
  let trialEndsAt = company.trialEndsAt ?? null
  if (!trialEndsAt && isTrialing && company.trialStartsAt) {
    const end = new Date(company.trialStartsAt)
    end.setDate(end.getDate() + 30)
    trialEndsAt = end
  }
  const trialExpired = isTrialing && (trialEndsAt ? Date.now() >= trialEndsAt.getTime() : true)

  // Active Stripe subscription
  if (subscriptionStatus === "active") {
    return {
      access: "ACTIVE",
      reason: "SUB_ACTIVE",
      limitedCapabilities: [],
      evaluatedAt,
    }
  }

  // Trialing and not expired
  if (subscriptionStatus === "trialing" && !trialExpired) {
    return {
      access: "ACTIVE",
      reason: "TRIAL_ACTIVE",
      limitedCapabilities: [],
      evaluatedAt,
    }
  }

  // Past due / unpaid
  if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") {
    return {
      access: "LIMITED",
      reason: "PAST_DUE",
      limitedCapabilities: LIMITED_CAPABILITIES,
      evaluatedAt,
    }
  }

  // Canceled / incomplete
  if (subscriptionStatus === "canceled" || subscriptionStatus === "incomplete_expired") {
    return {
      access: "LIMITED",
      reason: "CANCELED",
      limitedCapabilities: LIMITED_CAPABILITIES,
      evaluatedAt,
    }
  }
  if (subscriptionStatus === "incomplete") {
    return {
      access: "LIMITED",
      reason: "INCOMPLETE",
      limitedCapabilities: LIMITED_CAPABILITIES,
      evaluatedAt,
    }
  }

  // No subscription or trial expired: check for manual override (status ACTIVE without active sub)
  if (company.status === "ACTIVE" && !company.stripeSubscriptionId) {
    return {
      access: "ACTIVE",
      reason: "MANUAL_OVERRIDE",
      limitedCapabilities: [],
      evaluatedAt,
    }
  }

  // Trial expired or no sub
  return {
    access: "LIMITED",
    reason: "NO_SUB",
    limitedCapabilities: LIMITED_CAPABILITIES,
    evaluatedAt,
  }
}
