import { UserRole } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { requireTenantContext, type TenantContext } from "./tenant"

export type Permission =
  | "users:read"
  | "users:write"
  | "homes:read"
  | "homes:write"
  | "tasks:read"
  | "tasks:write"
  | "contractors:read"
  | "contractors:write"
  | "subdivisions:read"
  | "subdivisions:write"
  | "templates:read"
  | "templates:write"
  | "sms:send"
  | "dashboard:view"
  | "my-week:view"
  | "companies:read"

const rolePermissions: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ["companies:read"],
  PlatformAdmin: ["companies:read"],
  Admin: [
    "users:read",
    "users:write",
    "homes:read",
    "homes:write",
    "tasks:read",
    "tasks:write",
    "contractors:read",
    "contractors:write",
    "subdivisions:read",
    "subdivisions:write",
    "templates:read",
    "templates:write",
    "sms:send",
    "dashboard:view",
    "my-week:view",
  ],
  Superintendent: [
    "homes:read",
    "subdivisions:read",
    "tasks:read",
    "tasks:write",
    "contractors:read",
    "sms:send",
    "dashboard:view",
    "my-week:view",
  ],
  Manager: [
    "homes:read",
    "subdivisions:read",
    "tasks:read",
    "tasks:write",
    "contractors:read",
    "sms:send",
    "dashboard:view",
    "users:write",
  ],
  Subcontractor: [
    "my-week:view",
  ],
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false
}

/**
 * Use in API routes: loads tenant context from DB and checks permission.
 * Returns TenantContext for scoping (companyId, role, contractorId).
 */
export async function requireTenantPermission(permission: Permission): Promise<TenantContext> {
  const ctx = await requireTenantContext()
  if (!hasPermission(ctx.role, permission)) {
    const err = new Error("Forbidden") as Error & { statusCode?: number }
    err.statusCode = 403
    throw err
  }
  // Enforce subscription / trial state for write-style permissions (except for super admin / platform admin).
  const isWritePermission =
    permission.endsWith(":write") || permission === "sms:send"
  if (
    isWritePermission &&
    ctx.role !== "SUPER_ADMIN" &&
    ctx.role !== "PlatformAdmin"
  ) {
    const { prisma } = await import("@/lib/prisma")
    const { checkSubscriptionGuard } = await import("@/lib/billing/subscriptionGuard")
    const result = await checkSubscriptionGuard(prisma, ctx.companyId)
    if (!result.allowed && result.trialExpired) {
      const err = new Error("Payment required") as Error & {
        statusCode?: number
        payload?: unknown
      }
      err.statusCode = 402
      err.payload = {
        error: "Trial expired or subscription inactive",
        code: "TRIAL_EXPIRED",
        subscriptionStatus: result.subscriptionStatus,
        activeHomesCount: result.activeHomesCount,
        recommendedPlan: result.recommendedPlan,
      }
      throw err
    }
  }
  return ctx
}

/** Tenant company Admin only (not Superintendent/Manager). For settings that must not be delegated. */
export async function requireTenantAdmin(): Promise<TenantContext> {
  const ctx = await requireTenantContext()
  if (ctx.role !== "Admin") {
    const err = new Error("Forbidden") as Error & { statusCode?: number }
    err.statusCode = 403
    throw err
  }
  const { checkSubscriptionGuard } = await import("@/lib/billing/subscriptionGuard")
  const { prisma } = await import("@/lib/prisma")
  const result = await checkSubscriptionGuard(prisma, ctx.companyId)
  if (!result.allowed && result.trialExpired) {
    const err = new Error("Payment required") as Error & {
      statusCode?: number
      payload?: unknown
    }
    err.statusCode = 402
    err.payload = {
      error: "Trial expired or subscription inactive",
      code: "TRIAL_EXPIRED",
      subscriptionStatus: result.subscriptionStatus,
      activeHomesCount: result.activeHomesCount,
      recommendedPlan: result.recommendedPlan,
    }
    throw err
  }
  return ctx
}

/** @deprecated Use requireTenantPermission for API routes (enforces company + permission). */
export async function requirePermission(permission: Permission) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    const err = new Error("Unauthorized") as Error & { statusCode?: number }
    err.statusCode = 401
    throw err
  }
  if (!hasPermission(session.user.role, permission)) {
    const err = new Error("Forbidden") as Error & { statusCode?: number }
    err.statusCode = 403
    throw err
  }
  return session.user
}

/** Allow if the user has ANY of the listed permissions (useful for flows that span multiple capabilities). */
export async function requireAnyPermission(...permissions: Permission[]) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    const err = new Error("Unauthorized") as Error & { statusCode?: number }
    err.statusCode = 401
    throw err
  }
  const ok = permissions.some((p) => hasPermission(session.user.role, p))
  if (!ok) {
    const err = new Error("Forbidden") as Error & { statusCode?: number }
    err.statusCode = 403
    throw err
  }
  return session.user
}

export async function requireRole(...roles: UserRole[]) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    throw new Error("Unauthorized")
  }
  if (!roles.includes(session.user.role)) {
    throw new Error("Forbidden")
  }
  return session.user
}
