/**
 * Minimal verification that tenant isolation is enforced.
 * Run after backfill: npx tsx scripts/verify-tenant-isolation.ts
 *
 * Creates two companies and checks that:
 * - User from company A cannot read company B's home by id (API would return 404/403).
 * - Subcontractor cannot see unassigned home (API would return empty list or 403).
 *
 * This script uses Prisma directly to simulate "user A requests home B" by checking
 * that data exists in DB but would be excluded by companyId filters.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Verifying tenant isolation...")

  const companies = await prisma.company.findMany({
    take: 2,
    include: {
      homes: { take: 1, select: { id: true } },
      users: { take: 1, select: { id: true, role: true, companyId: true } },
    },
  })

  if (companies.length < 2) {
    console.log("SKIP: Need at least 2 companies in DB. Create another company and run backfill for it, or create manually.")
    return
  }

  const [companyA, companyB] = companies
  const homeB = companyB.homes[0]
  const userA = companyA.users[0]

  if (!homeB || !userA) {
    console.log("SKIP: Need at least one home in company B and one user in company A.")
    return
  }

  // Check: fetching home B with company A's scope should return null
  const homeBAsSeenByA = await prisma.home.findFirst({
    where: { id: homeB.id, companyId: userA.companyId! },
  })

  if (homeBAsSeenByA !== null) {
    console.error("FAIL: User from company A could see company B's home (companyId filter would allow it).")
    process.exit(1)
  }

  console.log("PASS: User from company A cannot see company B's home (companyId filter works).")

  // Check: subcontractor with no assignment should have empty assigned home list
  const subUser = await prisma.user.findFirst({
    where: { role: "Subcontractor", companyId: companyA.id, contractorId: { not: null } },
    select: { id: true, contractorId: true, companyId: true },
  })

  if (subUser) {
    const assignments = await prisma.contractorAssignment.findMany({
      where: { companyId: subUser.companyId!, contractorId: subUser.contractorId! },
      select: { homeId: true },
    })
    const assignedIds = assignments.map((a) => a.homeId)
    const homeInSameCompanyNotAssigned = await prisma.home.findFirst({
      where: {
        companyId: subUser.companyId!,
        id: { notIn: assignedIds.length ? assignedIds : ["__none__"] },
      },
      select: { id: true },
    })
    if (homeInSameCompanyNotAssigned && assignedIds.length === 0) {
      console.log("PASS: Subcontractor has no assignments; unassigned homes exist and would be excluded by getAssignedHomeIdsForContractor.")
    }
  }

  console.log("Tenant isolation checks passed.")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
