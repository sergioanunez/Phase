/**
 * Backfill script: create default Company and set companyId on all existing records.
 * Run after applying the migration that adds Company and optional companyId fields.
 *
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-company.ts
 * Or: npx tsx scripts/backfill-company.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const DEFAULT_COMPANY_NAME = process.env.DEFAULT_COMPANY_NAME || "Cullers Homes"

async function main() {
  console.log("Backfilling company (multi-tenancy)...")

  // 1. Find or create default company
  let company = await prisma.company.findFirst({
    where: { name: DEFAULT_COMPANY_NAME },
  })
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: DEFAULT_COMPANY_NAME,
        pricingTier: "SMALL",
        maxActiveHomes: null,
      },
    })
    console.log(`Created company: ${company.name} (${company.id})`)
  } else {
    console.log(`Using existing company: ${company.name} (${company.id})`)
  }

  const companyId = company.id

  // 2. Users
  const usersResult = await prisma.user.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${usersResult.count} users`)

  // 3. Subdivisions
  const subResult = await prisma.subdivision.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${subResult.count} subdivisions`)

  // 4. Contractors
  const contractorsResult = await prisma.contractor.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${contractorsResult.count} contractors`)

  // 5. Homes
  const homesResult = await prisma.home.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${homesResult.count} homes`)

  // 6. WorkTemplateItem
  const templateItemsResult = await prisma.workTemplateItem.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${templateItemsResult.count} work template items`)

  // 7. TemplateDependency
  const templateDepsResult = await prisma.templateDependency.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${templateDepsResult.count} template dependencies`)

  // 8. HomeTask
  const homeTasksResult = await prisma.homeTask.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${homeTasksResult.count} home tasks`)

  // 9. PunchItem
  const punchItemsResult = await prisma.punchItem.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${punchItemsResult.count} punch items`)

  // 10. AuditLog (set from first user's company or default company)
  const auditLogsResult = await prisma.auditLog.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${auditLogsResult.count} audit logs`)

  // 11. HomeAssignment
  const homeAssignmentsResult = await prisma.homeAssignment.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${homeAssignmentsResult.count} home assignments`)

  // 12. UserInvite (set companyId from invite's createdBy user)
  const invitesWithoutCompany = await prisma.userInvite.findMany({
    where: { companyId: null },
    select: { id: true, createdByUserId: true },
  })
  for (const inv of invitesWithoutCompany) {
    const creator = await prisma.user.findUnique({
      where: { id: inv.createdByUserId },
      select: { companyId: true },
    })
    if (creator?.companyId) {
      await prisma.userInvite.update({
        where: { id: inv.id },
        data: { companyId: creator.companyId },
      })
    } else {
      await prisma.userInvite.update({
        where: { id: inv.id },
        data: { companyId },
      })
    }
  }
  console.log(`Updated ${invitesWithoutCompany.length} user invites`)

  // 13. SmsMessage (set companyId from homeTask -> home if available, else default)
  const smsWithoutCompany = await prisma.smsMessage.findMany({
    where: { companyId: null },
    select: { id: true, homeTaskId: true },
  })
  for (const sms of smsWithoutCompany) {
    let targetCompanyId = companyId
    if (sms.homeTaskId) {
      const task = await prisma.homeTask.findUnique({
        where: { id: sms.homeTaskId },
        select: { home: { select: { companyId: true } } },
      })
      if (task?.home?.companyId) targetCompanyId = task.home.companyId
    }
    await prisma.smsMessage.update({
      where: { id: sms.id },
      data: { companyId: targetCompanyId },
    })
  }
  console.log(`Updated ${smsWithoutCompany.length} SMS messages`)

  // 14. CategoryGate
  const categoryGatesResult = await prisma.categoryGate.updateMany({
    where: { companyId: null },
    data: { companyId },
  })
  console.log(`Updated ${categoryGatesResult.count} category gates`)

  // 15. ContractorAssignment: create from HomeTask (homeId, contractorId) where contractorId is set
  const tasksWithContractor = await prisma.homeTask.findMany({
    where: {
      contractorId: { not: null },
      companyId,
    },
    select: { homeId: true, contractorId: true },
    distinct: ["homeId", "contractorId"],
  })
  let createdAssignments = 0
  for (const t of tasksWithContractor) {
    if (!t.contractorId) continue
    const existing = await prisma.contractorAssignment.findUnique({
      where: {
        contractorId_homeId: { contractorId: t.contractorId, homeId: t.homeId },
      },
    })
    if (!existing) {
      await prisma.contractorAssignment.create({
        data: {
          companyId,
          contractorId: t.contractorId,
          homeId: t.homeId,
        },
      })
      createdAssignments++
    }
  }
  console.log(`Created ${createdAssignments} contractor assignments from existing task assignments`)

  console.log("\nBackfill complete. Next step: make companyId required in schema and run migration.")
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
