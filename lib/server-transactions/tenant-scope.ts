import type { Prisma } from "@prisma/client"

/** Legacy-safe tenant filter for nullable companyId rows. */
export function tenantScopedWhere(companyId: string): Prisma.HomeTaskWhereInput {
  return {
    OR: [{ companyId }, { companyId: null, home: { companyId } }],
  }
}

export function tenantScopedPunchWhere(companyId: string): Prisma.PunchItemWhereInput {
  return {
    OR: [
      { companyId },
      { companyId: null, home: { companyId } },
      { companyId: null, relatedHomeTask: { companyId } },
      { companyId: null, relatedHomeTask: { home: { companyId } } },
    ],
  }
}

export function tenantScopedHomeWhere(companyId: string): Prisma.HomeWhereInput {
  return { companyId }
}
