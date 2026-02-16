import Stripe from "stripe"

const secretKey = process.env.STRIPE_SECRET_KEY
export const stripe = secretKey ? new Stripe(secretKey) : null

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ""

export type PlanKey = "starter" | "growth" | "unlimited" | "white_label"

export interface PlanConfig {
  planKey: PlanKey
  stripePriceId: string
  maxActiveHomes: number | null
  maxUsers: number | null
  whiteLabelEnabled: boolean
  label: string
  priceLabel: string
}

function getPriceId(envKey: string): string {
  return process.env[envKey] ?? ""
}

/**
 * Plan map: planKey -> Stripe Price ID + entitlement defaults.
 * Env vars: STRIPE_STARTER_PRICE_ID, STRIPE_GROWTH_PRICE_ID, STRIPE_UNLIMITED_PRICE_ID, STRIPE_WHITE_LABEL_PRICE_ID (optional).
 */
export const PLANS: Record<PlanKey, PlanConfig> = {
  starter: {
    planKey: "starter",
    stripePriceId: getPriceId("STRIPE_STARTER_PRICE_ID"),
    maxActiveHomes: 5,
    maxUsers: -1,
    whiteLabelEnabled: false,
    label: "Starter",
    priceLabel: "$199/mo",
  },
  growth: {
    planKey: "growth",
    stripePriceId: getPriceId("STRIPE_GROWTH_PRICE_ID"),
    maxActiveHomes: 25,
    maxUsers: -1,
    whiteLabelEnabled: false,
    label: "Growth",
    priceLabel: "$399/mo",
  },
  unlimited: {
    planKey: "unlimited",
    stripePriceId: getPriceId("STRIPE_UNLIMITED_PRICE_ID"),
    maxActiveHomes: null,
    maxUsers: null,
    whiteLabelEnabled: false,
    label: "Scale",
    priceLabel: "$799/mo",
  },
  white_label: {
    planKey: "white_label",
    stripePriceId: getPriceId("STRIPE_WHITE_LABEL_PRICE_ID"),
    maxActiveHomes: null,
    maxUsers: null,
    whiteLabelEnabled: true,
    label: "White Label",
    priceLabel: "Custom",
  },
}

export function getPlanByPriceId(priceId: string): PlanConfig | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceId && plan.stripePriceId === priceId) return plan
  }
  return null
}

export function getPlanByKey(planKey: string): PlanConfig | null {
  if (planKey in PLANS) return PLANS[planKey as PlanKey]
  return null
}

/** Entitlements object for Company.entitlementsJson. -1 = unlimited. */
export function entitlementsFromPlan(plan: PlanConfig): {
  maxActiveHomes: number | null
  maxUsers: number | null
  whiteLabelEnabled: boolean
} {
  return {
    maxActiveHomes: plan.maxActiveHomes ?? null,
    maxUsers: plan.maxUsers == null || plan.maxUsers === -1 ? null : plan.maxUsers,
    whiteLabelEnabled: plan.whiteLabelEnabled,
  }
}
