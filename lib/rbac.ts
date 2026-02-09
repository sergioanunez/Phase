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
    "my-week:view",
  ],
  Manager: [
    "homes:read",
    "subdivisions:read",
    "tasks:read",
    "tasks:write",
    "contractors:read",
    "dashboard:view",
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
  return ctx
}

/** @deprecated Use requireTenantPermission for API routes (enforces company + permission). */
export async function requirePermission(permission: Permission) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    throw new Error("Unauthorized")
  }
  if (!hasPermission(session.user.role, permission)) {
    throw new Error("Forbidden")
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
