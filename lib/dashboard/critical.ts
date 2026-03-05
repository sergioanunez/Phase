import { prisma } from "@/lib/prisma"
import { computeHomeForecastAndPersist } from "@/lib/forecast"

/**
 * Returns IDs of critical tasks for the given home.
 *
 * Priority:
 *  A) Tasks whose template item is marked as a critical gate (isCriticalGate = true)
 *  B) Tasks flagged as isCriticalPath = true (from forecast computation)
 *  C) If neither exist, recompute forecast to populate isCriticalPath and return those.
 */
export async function getCriticalTaskIdsForHome(homeId: string): Promise<string[]> {
  const tasks = await prisma.homeTask.findMany({
    where: { homeId },
    select: {
      id: true,
      isCriticalPath: true,
      templateItem: {
        select: {
          isCriticalGate: true,
        },
      },
    },
  })

  if (tasks.length === 0) return []

  const gateTasks = tasks.filter((t) => t.templateItem?.isCriticalGate)
  if (gateTasks.length > 0) {
    return gateTasks.map((t) => t.id)
  }

  const criticalPathTasks = tasks.filter((t) => t.isCriticalPath)
  if (criticalPathTasks.length > 0) {
    return criticalPathTasks.map((t) => t.id)
  }

  // Fallback: recompute forecast to populate isCriticalPath,
  // then re-query critical path tasks.
  await computeHomeForecastAndPersist(homeId)
  const recomputed = await prisma.homeTask.findMany({
    where: { homeId, isCriticalPath: true },
    select: { id: true },
  })
  return recomputed.map((t) => t.id)
}

