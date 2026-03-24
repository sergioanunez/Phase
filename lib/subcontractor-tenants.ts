/**
 * Resolves which tenants (companies) and per-tenant Contractor rows a subcontractor
 * can access for scheduling panels (multi-tenant directory identity).
 */

import { prisma } from "./prisma"

export type SubcontractorTenant = {
  companyId: string
  companyName: string
  contractorId: string
  contractorName: string | null
}

/**
 * - Starts from CompanyMembership rows (role Subcontractor, contractor set).
 * - Collects global contractorDirectoryIds from those memberships / linked contractors.
 * - Adds any other companies where a Contractor exists with the same directory id
 *   (so linking/scheduling in a second tenant appears without a duplicate membership row).
 */
export async function listSubcontractorTenantsForUser(userId: string): Promise<SubcontractorTenant[]> {
  const memberships = await prisma.companyMembership.findMany({
    where: {
      userId,
      role: "Subcontractor",
      contractorId: { not: null },
    },
    include: {
      company: { select: { id: true, name: true } },
      contractor: { select: { id: true, companyName: true, contractorDirectoryId: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const byCompany = new Map<string, SubcontractorTenant>()
  const directoryIds = new Set<string>()

  for (const m of memberships) {
    if (m.contractorId) {
      byCompany.set(m.company.id, {
        companyId: m.company.id,
        companyName: m.company.name,
        contractorId: m.contractorId,
        contractorName: m.contractor?.companyName ?? null,
      })
    }
    if (m.contractorDirectoryId) directoryIds.add(m.contractorDirectoryId)
    if (m.contractor?.contractorDirectoryId) directoryIds.add(m.contractor.contractorDirectoryId)
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      contractor: { select: { contractorDirectoryId: true } },
    },
  })
  if (user?.contractor?.contractorDirectoryId) {
    directoryIds.add(user.contractor.contractorDirectoryId)
  }

  if (directoryIds.size > 0) {
    const linkedContractors = await prisma.contractor.findMany({
      where: {
        contractorDirectoryId: { in: [...directoryIds] },
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    })
    for (const c of linkedContractors) {
      if (!c.companyId || !c.company) continue
      if (!byCompany.has(c.companyId)) {
        byCompany.set(c.companyId, {
          companyId: c.company.id,
          companyName: c.company.name,
          contractorId: c.id,
          contractorName: c.companyName,
        })
      }
    }
  }

  return [...byCompany.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName, undefined, { sensitivity: "base" })
  )
}
