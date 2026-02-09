import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { prisma } from "./prisma"
import { UserRole } from "@prisma/client"
import { getEffectiveAuthContext } from "./impersonation"

export type TenantContext = {
  userId: string
  companyId: string
  role: UserRole
  contractorId: string | null
  companyName?: string
}

/**
 * Returns the current session user or throws (401).
 * Use when you only need to know the user is authenticated.
 */
export async function requireAuth(): Promise<{ id: string; email: string; name: string; role: UserRole; contractorId: string | null }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    const err = new Error("Unauthorized") as Error & { statusCode?: number }
    err.statusCode = 401
    throw err
  }
  return session.user as { id: string; email: string; name: string; role: UserRole; contractorId: string | null }
}

/**
 * Loads the user from DB and returns tenant context.
 * If SUPER_ADMIN is impersonating (cookie set), returns impersonated user's context.
 * If user has no companyId, throws 403 (contact admin).
 * All API routes must use this and scope by ctx.companyId.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    const err = new Error("Unauthorized") as Error & { statusCode?: number }
    err.statusCode = 401
    throw err
  }

  const effective = await getEffectiveAuthContext(session)
  if (effective) return effective

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      companyId: true,
      role: true,
      contractorId: true,
      company: { select: { name: true } },
    },
  })

  if (!user) {
    const err = new Error("Unauthorized") as Error & { statusCode?: number }
    err.statusCode = 401
    throw err
  }

  if (!user.companyId) {
    const err = new Error("No company assigned. Please contact your administrator.") as Error & { statusCode?: number }
    err.statusCode = 403
    throw err
  }

  return {
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
    contractorId: user.contractorId,
    companyName: user.company?.name,
  }
}

/**
 * Returns the current session user from DB with companyId (and optional first membership).
 * Use to check if user has a company without throwing (e.g. before provisioning).
 */
export async function getSessionUserWithCompany(): Promise<{
  id: string
  email: string
  name: string
  companyId: string | null
  role: UserRole
} | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, companyId: true, role: true },
  })
  return user
}

/**
 * Returns home IDs the subcontractor is assigned to (via ContractorAssignment).
 * Use for SUBCONTRACTOR role to restrict queries to assigned homes only.
 */
export async function getAssignedHomeIdsForContractor(
  companyId: string,
  contractorId: string
): Promise<string[]> {
  const assignments = await prisma.contractorAssignment.findMany({
    where: { companyId, contractorId },
    select: { homeId: true },
  })
  return assignments.map((a) => a.homeId)
}
