import { addDays } from "date-fns"
import type { PrismaClient } from "@prisma/client"

/** Transaction type for Prisma client inside $transaction callback */
type Transaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

const SAMPLE_TEMPLATE_ITEMS = [
  { name: "Form Layout", defaultDurationDays: 1, sortOrder: 1 },
  { name: "Foundation Pour", defaultDurationDays: 1, sortOrder: 2 },
  { name: "Framing", defaultDurationDays: 5, sortOrder: 3 },
  { name: "Rough MEP", defaultDurationDays: 5, sortOrder: 4 },
  { name: "Insulation", defaultDurationDays: 1, sortOrder: 5 },
  { name: "Drywall", defaultDurationDays: 3, sortOrder: 6 },
  { name: "Cabinets", defaultDurationDays: 2, sortOrder: 7 },
  { name: "Final", defaultDurationDays: 2, sortOrder: 8 },
] as const

/**
 * Seeds minimal default data for a new trial company. Safe to run inside a transaction.
 * Does not send SMS; contractors use smsEnabled=false.
 */
export async function seedTrialCompany(
  tx: Transaction,
  companyId: string,
  _actorUserId: string
): Promise<void> {
  const subdivision = await tx.subdivision.create({
    data: {
      companyId,
      name: "Sample Subdivision",
    },
  })

  const targetCompletionDate = addDays(new Date(), 120)

  const home = await tx.home.create({
    data: {
      companyId,
      subdivisionId: subdivision.id,
      addressOrLot: "123 Sample St",
      targetCompletionDate,
    },
  })

  const contractor1 = await tx.contractor.create({
    data: {
      companyId,
      companyName: "Sample Framer Co",
      contactName: "Sample Framer",
      phone: "+15005550006",
      email: "sample-framer@example.com",
      trade: "Framing",
      active: true,
      smsEnabled: false,
    },
  })

  const contractor2 = await tx.contractor.create({
    data: {
      companyId,
      companyName: "Sample MEP Co",
      contactName: "Sample MEP",
      phone: "+15005550007",
      email: "sample-mep@example.com",
      trade: "MEP",
      active: true,
      smsEnabled: false,
    },
  })

  const templateItems: { id: string; name: string; defaultDurationDays: number; sortOrder: number }[] = []
  for (const item of SAMPLE_TEMPLATE_ITEMS) {
    const created = await tx.workTemplateItem.create({
      data: {
        companyId,
        name: item.name,
        defaultDurationDays: item.defaultDurationDays,
        sortOrder: item.sortOrder,
      },
    })
    templateItems.push({
      id: created.id,
      name: created.name,
      defaultDurationDays: created.defaultDurationDays,
      sortOrder: created.sortOrder,
    })
  }

  for (let i = 1; i < templateItems.length; i++) {
    await tx.templateDependency.create({
      data: {
        companyId,
        templateItemId: templateItems[i].id,
        dependsOnItemId: templateItems[i - 1].id,
      },
    })
  }

  for (const template of templateItems) {
    await tx.homeTask.create({
      data: {
        companyId,
        homeId: home.id,
        templateItemId: template.id,
        nameSnapshot: template.name,
        durationDaysSnapshot: template.defaultDurationDays,
        sortOrderSnapshot: template.sortOrder,
        status: "Unscheduled",
      },
    })
  }

  const firstTask = await tx.homeTask.findFirst({
    where: { homeId: home.id },
    orderBy: { sortOrderSnapshot: "asc" },
  })
  if (firstTask) {
    await tx.punchItem.create({
      data: {
        companyId,
        homeId: home.id,
        relatedHomeTaskId: firstTask.id,
        createdByUserId: _actorUserId,
        assignedContractorId: contractor1.id,
        category: "Framing",
        severity: "Minor",
        title: "Sample punch item",
        description: "Example item for trial exploration",
        status: "Open",
      },
    })
  }
}
