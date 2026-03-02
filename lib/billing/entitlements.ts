import type { PrismaClient } from "@prisma/client"

export type BillingGates = {
  canScheduleTasks: boolean
  canCreatePunchlists: boolean
  canCreateHomes: boolean
  canCreateSubdivisions: boolean
}

/**
 * Returns billing gates for the tenant. When trial has ended and there is no
 * active subscription, all gates are false. Otherwise all true (restrictions
 * like active home limit are enforced elsewhere).
 */
export async function getBillingGates(
  prisma: PrismaClient,
  tenantId: string
): Promise<BillingGates> {
  const company = await prisma.company.findFirst({
    where: { id: tenantId },
    select: {
      status: true,
      subscriptionStatus: true,
      trialStartsAt: true,
      trialEndsAt: true,
    },
  })

  if (!company) {
    return {
      canScheduleTasks: false,
      canCreatePunchlists: false,
      canCreateHomes: false,
      canCreateSubdivisions: false,
    }
  }

  const subscriptionStatus = company.subscriptionStatus ?? null
  const subscriptionActive = subscriptionStatus === "active"
  const isTrialing =
    company.status === "TRIAL" || subscriptionStatus === "trialing"
  let trialEndsAt = company.trialEndsAt ?? null
  if (!trialEndsAt && isTrialing && company.trialStartsAt) {
    const end = new Date(company.trialStartsAt)
    end.setDate(end.getDate() + 30)
    trialEndsAt = end
  }
  const trialExpired = isTrialing && (trialEndsAt ? Date.now() >= trialEndsAt.getTime() : true)
  const hasAccess = subscriptionActive || (isTrialing && !trialExpired)

  return {
    canScheduleTasks: hasAccess,
    canCreatePunchlists: hasAccess,
    canCreateHomes: hasAccess,
    canCreateSubdivisions: hasAccess,
  }
}

export const UPGRADE_TITLE = "Upgrade to continue"
export const UPGRADE_BODY =
  "Your trial has ended. Upgrade to schedule tasks, create punchlists, and add homes or subdivisions."
export const UPGRADE_CTA = "Upgrade"
export const UPGRADE_SECONDARY = "Not now"
