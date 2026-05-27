import { addDays, subDays } from "date-fns"
import type {
  ActivityEventType,
  PrismaClient,
  TaskConfirmationSource,
  TaskRescheduleReason,
  TaskStatus,
} from "@prisma/client"

type Transaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

const DEMO = { isDemo: true as const }

const TEMPLATE_DEFS = [
  { name: "Form Layout", category: "Preliminary", duration: 1, position: 100, prepLeadDays: 0 },
  { name: "Foundation", category: "Preliminary", duration: 3, position: 200, prepLeadDays: 1 },
  { name: "Lot Staking", category: "Preliminary", duration: 1, position: 300, prepLeadDays: 0 },
  { name: "Framing", category: "Structural", duration: 5, position: 100, prepLeadDays: 2 },
  { name: "Rough MEP", category: "Structural", duration: 4, position: 200, prepLeadDays: 1 },
  {
    name: "Structural Inspection",
    category: "Structural",
    duration: 1,
    position: 300,
    prepLeadDays: 0,
  },
  { name: "Insulation", category: "Finals", duration: 2, position: 100, prepLeadDays: 1 },
  { name: "Drywall", category: "Finals", duration: 4, position: 200, prepLeadDays: 1 },
  {
    name: "Cabinets",
    category: "Finals",
    duration: 3,
    position: 300,
    prepLeadDays: 2,
    requiresOrdering: true,
    materialLeadDays: 5,
  },
  { name: "Final Clean", category: "Finals", duration: 2, position: 400, prepLeadDays: 1 },
  { name: "Final Inspection", category: "Finals", duration: 1, position: 500, prepLeadDays: 0 },
] as const

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

async function seedActivity(
  tx: Transaction,
  companyId: string,
  homeId: string,
  event: {
    eventType: ActivityEventType
    title: string
    description?: string
    taskId?: string
    punchItemId?: string
    actorName?: string
    recipientName?: string
    createdAt?: Date
  }
) {
  await tx.activityEvent.create({
    data: {
      companyId,
      homeId,
      taskId: event.taskId,
      punchItemId: event.punchItemId,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      actorName: event.actorName,
      recipientName: event.recipientName,
      createdAt: event.createdAt ?? new Date(),
      ...DEMO,
    },
  })
}

/**
 * Seeds a rich demo workspace for new trial tenants. Idempotent: skips if already seeded,
 * cleared, or tenant has any homes.
 */
export async function seedTrialCompany(
  tx: Transaction,
  companyId: string,
  actorUserId: string
): Promise<void> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { demoDataSeeded: true, demoDataCleared: true },
  })
  if (!company || company.demoDataSeeded || company.demoDataCleared) {
    return
  }

  const existingHomes = await tx.home.count({ where: { companyId } })
  if (existingHomes > 0) {
    return
  }

  const today = startOfDay(new Date())

  const contractors = {
    framing: await tx.contractor.create({
      data: {
        companyId,
        companyName: "Summit Framing",
        contactName: "Mike Torres",
        phone: "+15005551001",
        email: "dispatch@summitframing.example",
        trade: "Framing",
        active: true,
        smsEnabled: false,
        leadDays: 2,
        ...DEMO,
      },
    }),
    electric: await tx.contractor.create({
      data: {
        companyId,
        companyName: "Desert Electric",
        contactName: "Rachel Kim",
        phone: "+15005551002",
        email: "office@desertelectric.example",
        trade: "Electrical",
        active: true,
        smsEnabled: false,
        leadDays: 1,
        ...DEMO,
      },
    }),
    plumbing: await tx.contractor.create({
      data: {
        companyId,
        companyName: "Copper Ridge Plumbing",
        contactName: "Dan Walsh",
        phone: "+15005551003",
        email: "schedule@copperridge.example",
        trade: "Plumbing",
        active: true,
        smsEnabled: false,
        leadDays: 2,
        ...DEMO,
      },
    }),
    hvac: await tx.contractor.create({
      data: {
        companyId,
        companyName: "Horizon HVAC",
        contactName: "Sofia Mendez",
        phone: "+15005551004",
        email: "jobs@horizonhvac.example",
        trade: "HVAC",
        active: true,
        smsEnabled: false,
        leadDays: 2,
        ...DEMO,
      },
    }),
    drywall: await tx.contractor.create({
      data: {
        companyId,
        companyName: "Mesa Drywall",
        contactName: "Chris Neal",
        phone: "+15005551005",
        email: "crew@mesadrywall.example",
        trade: "Drywall",
        active: true,
        smsEnabled: false,
        leadDays: 1,
        ...DEMO,
      },
    }),
    cleaning: await tx.contractor.create({
      data: {
        companyId,
        companyName: "Final Touch Cleaning",
        contactName: "Amy Brooks",
        phone: "+15005551006",
        email: "bookings@finaltouch.example",
        trade: "Cleaning",
        active: true,
        smsEnabled: false,
        leadDays: 1,
        ...DEMO,
      },
    }),
  }

  const categories: Record<string, { id: string; position: number }> = {}
  const categoryPositions: Record<string, number> = {
    Preliminary: 100,
    Structural: 200,
    Finals: 300,
  }
  for (const catName of ["Preliminary", "Structural", "Finals"] as const) {
    const cat = await tx.workTemplateCategory.create({
      data: {
        companyId,
        name: catName,
        categoryPosition: categoryPositions[catName],
        ...DEMO,
      },
    })
    categories[catName] = { id: cat.id, position: categoryPositions[catName] }
  }

  const templateItems: Array<{
    id: string
    name: string
    defaultDurationDays: number
    sortOrder: number
    index: number
  }> = []

  let sortOrder = 1
  let sequenceOrder = 100
  for (const def of TEMPLATE_DEFS) {
    const tradeContractor =
      def.name.includes("Framing") || def.name.includes("Form")
        ? contractors.framing
        : def.name.includes("MEP") || def.name.includes("Electric")
          ? contractors.electric
          : def.name.includes("Foundation") || def.name.includes("Lot")
            ? contractors.plumbing
            : def.name.includes("HVAC") || def.name.includes("Insulation")
              ? contractors.hvac
              : def.name.includes("Drywall")
                ? contractors.drywall
                : def.name.includes("Clean") || def.name.includes("Cabinets")
                  ? contractors.cleaning
                  : null

    const created = await tx.workTemplateItem.create({
      data: {
        companyId,
        name: def.name,
        defaultDurationDays: def.duration,
        sortOrder,
        workTemplateCategoryId: categories[def.category].id,
        itemPosition: def.position,
        sequenceOrder,
        optionalCategory: def.category,
        prepLeadDays: def.prepLeadDays,
        requiresOrdering: "requiresOrdering" in def ? def.requiresOrdering : false,
        materialLeadDays: "materialLeadDays" in def ? def.materialLeadDays : 0,
        contractorId: tradeContractor?.id,
        ...DEMO,
      },
    })
    templateItems.push({
      id: created.id,
      name: created.name,
      defaultDurationDays: created.defaultDurationDays,
      sortOrder: created.sortOrder,
      index: sortOrder - 1,
    })
    sortOrder++
  }

  for (let i = 1; i < templateItems.length; i++) {
    await tx.templateDependency.create({
      data: {
        companyId,
        templateItemId: templateItems[i].id,
        dependsOnItemId: templateItems[i - 1].id,
        ...DEMO,
      },
    })
  }

  const subdivisions = {
    desertBloom: await tx.subdivision.create({
      data: { companyId, name: "Desert Bloom", ...DEMO },
    }),
    copperRidge: await tx.subdivision.create({
      data: { companyId, name: "Copper Ridge", ...DEMO },
    }),
    horizonRidge: await tx.subdivision.create({
      data: { companyId, name: "Horizon Ridge", ...DEMO },
    }),
  }

  const home1 = await tx.home.create({
    data: {
      companyId,
      subdivisionId: subdivisions.desertBloom.id,
      addressOrLot: "317 Juniper Creek",
      planName: "Palo Verde 1680",
      targetCompletionDate: addDays(today, 150),
      ...DEMO,
    },
  })

  const home2 = await tx.home.create({
    data: {
      companyId,
      subdivisionId: subdivisions.copperRidge.id,
      addressOrLot: "126 Wisteria Lane",
      planName: "Juniper 2140",
      startDate: subDays(today, 70),
      targetCompletionDate: addDays(today, 50),
      forecastCompletionDate: addDays(today, 55),
      forecastComputedAt: today,
      ...DEMO,
    },
  })

  const home3 = await tx.home.create({
    data: {
      companyId,
      subdivisionId: subdivisions.horizonRidge.id,
      addressOrLot: "804 Magnolia Bluff",
      planName: "Stonehaven 2405",
      startDate: subDays(today, 110),
      targetCompletionDate: addDays(today, 10),
      forecastCompletionDate: addDays(today, 28),
      forecastComputedAt: today,
      ...DEMO,
    },
  })

  for (const home of [home1, home2, home3]) {
    await tx.homeAssignment.create({
      data: { companyId, homeId: home.id, superintendentUserId: actorUserId },
    })
  }

  type TaskRow = { id: string; templateIndex: number; name: string }
  const tasksByHome: Record<string, TaskRow[]> = {}

  async function createTasksForHome(homeId: string): Promise<TaskRow[]> {
    const rows: TaskRow[] = []
    for (const template of templateItems) {
      const task = await tx.homeTask.create({
        data: {
          companyId,
          homeId,
          templateItemId: template.id,
          nameSnapshot: template.name,
          durationDaysSnapshot: template.defaultDurationDays,
          sortOrderSnapshot: template.sortOrder,
          status: "Unscheduled",
          ...DEMO,
        },
      })
      rows.push({ id: task.id, templateIndex: template.index, name: template.name })
    }
    return rows
  }

  tasksByHome[home1.id] = await createTasksForHome(home1.id)
  tasksByHome[home2.id] = await createTasksForHome(home2.id)
  tasksByHome[home3.id] = await createTasksForHome(home3.id)

  const t1 = tasksByHome[home1.id]
  const tomorrow = addDays(today, 1)

  await tx.homeTask.update({
    where: { id: t1[0].id },
    data: {
      status: "PendingConfirm",
      scheduledDate: tomorrow,
      contractorId: contractors.framing.id,
      lastConfirmationAt: subDays(today, 1),
    },
  })
  await tx.homeTask.update({
    where: { id: t1[1].id },
    data: {
      status: "Confirmed",
      scheduledDate: today,
      contractorId: contractors.framing.id,
      confirmedAt: subDays(today, 1),
      confirmationSource: "Sms" satisfies TaskConfirmationSource,
      lastConfirmationAt: subDays(today, 1),
    },
  })

  const t2 = tasksByHome[home2.id]
  const completedStatuses: TaskStatus = "Completed"
  for (let i = 0; i <= 3; i++) {
    await tx.homeTask.update({
      where: { id: t2[i].id },
      data: {
        status: completedStatuses,
        scheduledDate: subDays(today, 50 - i * 5),
        completedAt: subDays(today, 48 - i * 5),
        contractorId: contractors.framing.id,
      },
    })
  }

  const framingPrevDate = subDays(today, 2)
  const framingNewDate = addDays(today, 2)
  await tx.homeTask.update({
    where: { id: t2[4].id },
    data: {
      status: "Scheduled",
      scheduledDate: framingNewDate,
      contractorId: contractors.electric.id,
      lastRescheduleReason: "trade_unavailable" satisfies TaskRescheduleReason,
      lastRescheduleNote: "Crew shifted to Wisteria framing wrap-up",
      lastRescheduledAt: subDays(today, 1),
      lastRescheduledByUserId: actorUserId,
      lastPreviousScheduledDate: framingPrevDate,
      rescheduleCount: 1,
    },
  })
  await tx.taskRescheduleHistory.create({
    data: {
      companyId,
      homeId: home2.id,
      taskId: t2[4].id,
      previousScheduledDate: framingPrevDate,
      newScheduledDate: framingNewDate,
      reason: "trade_unavailable",
      note: "Crew shifted to Wisteria framing wrap-up",
      rescheduledByUserId: actorUserId,
      statusBefore: "Scheduled",
    },
  })

  await tx.homeTask.update({
    where: { id: t2[5].id },
    data: {
      status: completedStatuses,
      scheduledDate: subDays(today, 5),
      completedAt: subDays(today, 4),
      contractorId: contractors.plumbing.id,
    },
  })

  await tx.homeTask.update({
    where: { id: t2[6].id },
    data: {
      status: "Scheduled",
      scheduledDate: subDays(today, 3),
      contractorId: contractors.hvac.id,
    },
  })

  await tx.homeTask.update({
    where: { id: t2[7].id },
    data: {
      status: "PendingConfirm",
      scheduledDate: addDays(today, 4),
      contractorId: contractors.drywall.id,
      lastConfirmationAt: today,
    },
  })

  const t3 = tasksByHome[home3.id]
  for (let i = 0; i <= 8; i++) {
    await tx.homeTask.update({
      where: { id: t3[i].id },
      data: {
        status: completedStatuses,
        scheduledDate: subDays(today, 90 - i * 8),
        completedAt: subDays(today, 88 - i * 8),
        contractorId:
          i < 4
            ? contractors.framing.id
            : i < 6
              ? contractors.hvac.id
              : i === 8
                ? contractors.cleaning.id
                : contractors.drywall.id,
      },
    })
  }

  await tx.homeTask.update({
    where: { id: t3[9].id },
    data: {
      status: "Scheduled",
      scheduledDate: subDays(today, 2),
      contractorId: contractors.cleaning.id,
      hasOpenPunch: true,
      punchOpenCount: 1,
    },
  })

  const punchFinal = await tx.punchItem.create({
    data: {
      companyId,
      homeId: home3.id,
      relatedHomeTaskId: t3[9].id,
      createdByUserId: actorUserId,
      assignedContractorId: contractors.cleaning.id,
      category: "Paint",
      severity: "Minor",
      title: "Touch-up paint at rear entry",
      description: "Light scuff near mudroom door needs spot paint before final walk.",
      status: "Open",
      dueDate: addDays(today, 3),
      ...DEMO,
    },
  })

  await tx.homeTask.update({
    where: { id: t3[10].id },
    data: {
      status: "PendingConfirm",
      scheduledDate: addDays(today, 5),
      contractorId: contractors.plumbing.id,
      lastConfirmationAt: today,
    },
  })

  await tx.contractorAssignment.createMany({
    data: [
      { companyId, contractorId: contractors.framing.id, homeId: home2.id },
      { companyId, contractorId: contractors.electric.id, homeId: home2.id },
      { companyId, contractorId: contractors.plumbing.id, homeId: home2.id },
    ],
  })

  await seedActivity(tx, companyId, home1.id, {
    eventType: "sms_sent",
    title: "Confirmation SMS sent",
    description: "Foundation pour at 317 Juniper Creek",
    taskId: t1[1].id,
    recipientName: "Summit Framing",
    createdAt: subDays(today, 2),
  })
  await seedActivity(tx, companyId, home1.id, {
    eventType: "sms_confirmed",
    title: "Contractor confirmed",
    description: "Foundation pour",
    taskId: t1[1].id,
    recipientName: "Summit Framing",
    createdAt: subDays(today, 1),
  })
  await seedActivity(tx, companyId, home1.id, {
    eventType: "task_scheduled",
    title: "Form Layout scheduled",
    description: `Scheduled for ${tomorrow.toLocaleDateString()}`,
    taskId: t1[0].id,
    actorName: "You",
    createdAt: subDays(today, 1),
  })

  await seedActivity(tx, companyId, home2.id, {
    eventType: "task_completed",
    title: "Framing completed",
    taskId: t2[3].id,
    actorName: "Summit Framing",
    createdAt: subDays(today, 12),
  })
  await seedActivity(tx, companyId, home2.id, {
    eventType: "task_rescheduled",
    title: "Rough MEP rescheduled",
    description: "Moved to allow framing crew availability",
    taskId: t2[4].id,
    actorName: "You",
    createdAt: subDays(today, 1),
  })
  await seedActivity(tx, companyId, home2.id, {
    eventType: "inspection_passed",
    title: "Structural inspection passed",
    taskId: t2[5].id,
    createdAt: subDays(today, 4),
  })

  await seedActivity(tx, companyId, home3.id, {
    eventType: "task_completed",
    title: "Drywall completed",
    taskId: t3[7].id,
    createdAt: subDays(today, 6),
  })
  await seedActivity(tx, companyId, home3.id, {
    eventType: "punchlist_sent",
    title: "Punch item added",
    description: punchFinal.title,
    punchItemId: punchFinal.id,
    taskId: t3[9].id,
    createdAt: subDays(today, 2),
  })
  await seedActivity(tx, companyId, home3.id, {
    eventType: "task_completed",
    title: "Cabinets completed",
    taskId: t3[8].id,
    actorName: "Final Touch Cleaning",
    createdAt: subDays(today, 8),
  })

  await tx.notification.createMany({
    data: [
      {
        companyId,
        severity: "ATTENTION",
        category: "SCHEDULE",
        title: "Insulation overdue at Wisteria Lane",
        message: "Insulation at 126 Wisteria Lane was scheduled 3 days ago and is not complete.",
        entityType: "TASK",
        entityId: t2[6].id,
        homeId: home2.id,
        targetRole: "ANY",
        requiresAction: true,
        ...DEMO,
      },
      {
        companyId,
        severity: "INFO",
        category: "QUALITY",
        title: "Punch item on Magnolia Bluff",
        message: "Touch-up paint at rear entry was added to Final Clean.",
        entityType: "PUNCH",
        entityId: punchFinal.id,
        homeId: home3.id,
        targetRole: "ANY",
        requiresAction: false,
        ...DEMO,
      },
      {
        companyId,
        severity: "INFO",
        category: "SCHEDULE",
        title: "Confirmation pending — Juniper Creek",
        message: "Form Layout at 317 Juniper Creek is awaiting contractor confirmation.",
        entityType: "TASK",
        entityId: t1[0].id,
        homeId: home1.id,
        targetRole: "ANY",
        requiresAction: false,
        ...DEMO,
      },
    ],
  })

  await tx.company.update({
    where: { id: companyId },
    data: { demoDataSeeded: true },
  })
}
