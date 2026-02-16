import type { PrismaClient } from "@prisma/client"

export type TenantEntitlements = {
  maxActiveHomes: number | null
  maxUsers: number | null
  whiteLabelEnabled: boolean
}

export type TenantUsage = {
  activeHomesCount: number
  usersCount: number
}

function parseEntitlementsJson(json: unknown): Partial<TenantEntitlements> | null {
  if (json == null || typeof json !== "object") return null
  const o = json as Record<string, unknown>
  return {
    maxActiveHomes: typeof o.maxActiveHomes === "number" ? o.maxActiveHomes : undefined,
    maxUsers: typeof o.maxUsers === "number" ? o.maxUsers : undefined,
    whiteLabelEnabled: typeof o.whiteLabelEnabled === "boolean" ? o.whiteLabelEnabled : undefined,
  }
}

/**
 * Returns tenant entitlements. Uses entitlementsJson when present;
 * otherwise derives from Company fields (maxActiveHomes, brandAppName).
 * -1 or null for maxActiveHomes/maxUsers means unlimited.
 */
export async function getTenantEntitlements(
  prisma: PrismaClient,
  tenantId: string
): Promise<TenantEntitlements> {
  const company = await prisma.company.findFirst({
    where: { id: tenantId },
    select: {
      maxActiveHomes: true,
      entitlementsJson: true,
      brandAppName: true,
    },
  })
  if (!company) {
    return {
      maxActiveHomes: null,
      maxUsers: null,
      whiteLabelEnabled: false,
    }
  }

  const fromJson = parseEntitlementsJson(company.entitlementsJson)
  const maxActiveHomes =
    fromJson?.maxActiveHomes !== undefined
      ? fromJson.maxActiveHomes === -1
        ? null
        : fromJson.maxActiveHomes
      : company.maxActiveHomes === undefined || company.maxActiveHomes === null
        ? null
        : company.maxActiveHomes === -1
          ? null
          : company.maxActiveHomes
  const maxUsers =
    fromJson?.maxUsers !== undefined
      ? fromJson.maxUsers === -1
        ? null
        : fromJson.maxUsers
      : null
  const whiteLabelEnabled = fromJson?.whiteLabelEnabled ?? !!company.brandAppName

  return {
    maxActiveHomes,
    maxUsers,
    whiteLabelEnabled,
  }
}

/**
 * Returns current usage for the tenant: active homes (isComplete = false) and user count.
 */
export async function getTenantUsage(
  prisma: PrismaClient,
  tenantId: string
): Promise<TenantUsage> {
  const [activeHomesCount, usersCount] = await Promise.all([
    prisma.home.count({
      where: { companyId: tenantId, isComplete: false },
    }),
    prisma.user.count({
      where: { companyId: tenantId },
    }),
  ])
  return { activeHomesCount, usersCount }
}

export type CanCreateHomeResult = { allowed: boolean; error?: string; upgradeHint?: string }

/**
 * Returns whether the tenant can create a new home (subscription active + under active homes limit).
 * Use in server actions / API routes that create homes.
 */
export async function canCreateHome(
  prisma: PrismaClient,
  tenantId: string
): Promise<CanCreateHomeResult> {
  const company = await prisma.company.findFirst({
    where: { id: tenantId },
    select: { status: true },
  })
  if (!company) return { allowed: false, error: "Company not found" }
  const subStatus = company.status
  if (subStatus !== "ACTIVE" && subStatus !== "TRIAL") {
    return {
      allowed: false,
      error: "Your account is not active. Please update your billing or contact support.",
      upgradeHint: "/billing",
    }
  }
  const [entitlements, usage] = await Promise.all([
    getTenantEntitlements(prisma, tenantId),
    getTenantUsage(prisma, tenantId),
  ])
  const max = entitlements.maxActiveHomes
  if (max != null && max !== -1 && usage.activeHomesCount >= max) {
    return {
      allowed: false,
      error: `You've reached your plan limit of ${max} active homes. Complete a home or upgrade your plan.`,
      upgradeHint: "/billing",
    }
  }
  return { allowed: true }
}
