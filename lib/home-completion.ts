import type { PrismaClient } from "@prisma/client"

/**
 * A home is COMPLETE when ALL its schedule tasks have status Completed.
 * - 0 tasks => treat as active (isComplete = false).
 * - All tasks Completed => isComplete = true, completedAt = now.
 * - Any task not Completed => isComplete = false, completedAt = null.
 * Scoped by tenant (companyId); no cross-tenant leakage.
 */
export async function recalculateHomeCompletion(
  prisma: PrismaClient,
  homeId: string,
  tenantId: string
): Promise<void> {
  const home = await prisma.home.findFirst({
    where: { id: homeId, companyId: tenantId },
    select: { id: true },
  })
  if (!home) return

  const taskCount = await prisma.homeTask.count({
    where: { homeId, companyId: tenantId },
  })
  const incompleteCount = await prisma.homeTask.count({
    where: {
      homeId,
      companyId: tenantId,
      status: { notIn: ["Completed", "Canceled", "NotApplicable"] },
    },
  })

  if (taskCount === 0) {
    await prisma.home.update({
      where: { id: homeId },
      data: { isComplete: false, completedAt: null },
    })
    return
  }

  if (incompleteCount === 0) {
    await prisma.home.update({
      where: { id: homeId },
      data: { isComplete: true, completedAt: new Date() },
    })
  } else {
    await prisma.home.update({
      where: { id: homeId },
      data: { isComplete: false, completedAt: null },
    })
  }
}
