import type { PrismaClient } from "@prisma/client"

type Db = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

export type ClearDemoDataResult = {
  cleared: boolean
  alreadyCleared?: boolean
}

/**
 * Removes all demo-marked records for a tenant and marks demoDataCleared.
 * Does not touch non-demo homes, contractors, or templates.
 */
export async function clearDemoDataForCompany(
  db: Db,
  companyId: string
): Promise<ClearDemoDataResult> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { demoDataCleared: true },
  })
  if (!company) {
    throw new Error("Company not found")
  }
  if (company.demoDataCleared) {
    return { cleared: false, alreadyCleared: true }
  }

  const demoHomeIds = (
    await db.home.findMany({
      where: { companyId, isDemo: true },
      select: { id: true },
    })
  ).map((h) => h.id)

  if (demoHomeIds.length > 0) {
    await db.activityEvent.deleteMany({
      where: { companyId, OR: [{ isDemo: true }, { homeId: { in: demoHomeIds } }] },
    })
    await db.notification.deleteMany({
      where: { companyId, OR: [{ isDemo: true }, { homeId: { in: demoHomeIds } }] },
    })
    await db.taskRescheduleHistory.deleteMany({
      where: { companyId, homeId: { in: demoHomeIds } },
    })
    await db.home.deleteMany({
      where: { id: { in: demoHomeIds } },
    })
  } else {
    await db.activityEvent.deleteMany({ where: { companyId, isDemo: true } })
    await db.notification.deleteMany({ where: { companyId, isDemo: true } })
  }

  await db.contractor.deleteMany({
    where: { companyId, isDemo: true },
  })

  await db.subdivision.deleteMany({
    where: { companyId, isDemo: true },
  })

  await db.templateDependency.deleteMany({
    where: { companyId, isDemo: true },
  })

  await db.workTemplateItem.deleteMany({
    where: { companyId, isDemo: true },
  })

  await db.workTemplateCategory.deleteMany({
    where: { companyId, isDemo: true },
  })

  await db.company.update({
    where: { id: companyId },
    data: { demoDataCleared: true },
  })

  return { cleared: true }
}
