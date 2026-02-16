import Stripe from "stripe"

const secretKey = process.env.STRIPE_SECRET_KEY
export const stripe = secretKey ? new Stripe(secretKey) : null

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ""

export type PlanKey = "starter" | "growth" | "scale"

export interface PlanConfig {
  planKey: PlanKey
  stripePriceId: string
  maxActiveHomes: number
  maxUsers: number
  whiteLabelEnabled: boolean
  label: string
  priceLabel: string
}

function getPriceId(envKey: string): string {
  return process.env[envKey] ?? ""
}

/**
 * Internal plan map: planKey -> Stripe Price ID + entitlement defaults.
 * Env: STRIPE_PRICE_STARTER_ID, STRIPE_PRICE_GROWTH_ID, STRIPE_PRICE_SCALE_ID.
 * -1 = unlimited.
 */
export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  starter: {
    planKey: "starter",
    stripePriceId: getPriceId("STRIPE_PRICE_STARTER_ID"),
    maxActiveHomes: 5,
    maxUsers: 10,
    whiteLabelEnabled: false,
    label: "Starter",
    priceLabel: "$199/mo",
  },
  growth: {
    planKey: "growth",
    stripePriceId: getPriceId("STRIPE_PRICE_GROWTH_ID"),
    maxActiveHomes: 25,
    maxUsers: 25,
    whiteLabelEnabled: false,
    label: "Growth",
    priceLabel: "$399/mo",
  },
  scale: {
    planKey: "scale",
    stripePriceId: getPriceId("STRIPE_PRICE_SCALE_ID"),
    maxActiveHomes: -1,
    maxUsers: -1,
    whiteLabelEnabled: false,
    label: "Scale",
    priceLabel: "$799/mo",
  },
}

/** @deprecated Use PLAN_CONFIG */
export const PLANS = PLAN_CONFIG

export function getPlanByPriceId(priceId: string): PlanConfig | null {
  for (const plan of Object.values(PLAN_CONFIG)) {
    if (plan.stripePriceId && plan.stripePriceId === priceId) return plan
  }
  return null
}

export function getPlanByKey(planKey: string): PlanConfig | null {
  if (planKey in PLAN_CONFIG) return PLAN_CONFIG[planKey as PlanKey]
  return null
}

/** Entitlements for Company.entitlementsJson. -1 = unlimited. */
export function entitlementsFromPlan(plan: PlanConfig): {
  maxActiveHomes: number
  maxUsers: number
  whiteLabelEnabled: boolean
} {
  return {
    maxActiveHomes: plan.maxActiveHomes,
    maxUsers: plan.maxUsers,
    whiteLabelEnabled: plan.whiteLabelEnabled,
  }
}
