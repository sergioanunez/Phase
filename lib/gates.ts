import { prisma } from "./prisma"
import { GateScope } from "@prisma/client"

export interface GateCheckResult {
  isBlocked: boolean
  blockingGateName?: string
  blockingTaskId?: string
  openPunchCount?: number
}

/**
 * Check if a task is blocked by a critical gate
 * @param homeId - The home ID
 * @param taskId - The task ID to check
 * @param taskSortOrder - The sort order of the task being checked
 * @returns GateCheckResult indicating if blocked and why
 */
export async function checkGateBlocking(
  homeId: string,
  taskId: string,
  taskSortOrder: number
): Promise<GateCheckResult> {
  // Find all critical gate tasks for this home
  const allTasks = await prisma.homeTask.findMany({
    where: { homeId },
    include: {
      templateItem: {
        select: {
          isCriticalGate: true,
          gateScope: true,
          gateName: true,
          optionalCategory: true,
        },
      },
    },
    orderBy: {
      sortOrderSnapshot: "asc",
    },
  })

  // Find gate tasks (tasks where templateItem.isCriticalGate = true)
  const gateTasks = allTasks.filter((task) => task.templateItem?.isCriticalGate)

  if (gateTasks.length === 0) {
    return { isBlocked: false }
  }

  // Check each gate task
  for (const gateTask of gateTasks) {
    const gateScope = gateTask.templateItem?.gateScope || "DownstreamOnly"
    const gateName = gateTask.templateItem?.gateName || "Critical Gate"

    // Check if this gate applies to the task being checked
    let gateApplies = false

    if (gateScope === "AllScheduling") {
      // Block all scheduling if gate is not cleared
      gateApplies = true
    } else if (gateScope === "DownstreamOnly") {
      // Only block tasks that come after the gate task
      gateApplies = taskSortOrder > gateTask.sortOrderSnapshot
    }

    if (!gateApplies) {
      continue
    }

    // Check if gate has open punch items
    const openPunchCount = await prisma.punchItem.count({
      where: {
        relatedHomeTaskId: gateTask.id,
        status: {
          in: ["Open", "ReadyForReview"],
        },
      },
    })

    if (openPunchCount > 0) {
      return {
        isBlocked: true,
        blockingGateName: gateName,
        blockingTaskId: gateTask.id,
        openPunchCount,
      }
    }
  }

  // Check category gates - check if any previous category is a gate and not completed
  const task = allTasks.find((t) => t.id === taskId)
  if (task) {
    const taskCategory = task.templateItem?.optionalCategory || "Uncategorized"
    
    // Category order (same as in UI)
    const categoryOrder = [
      "Preliminary work",
      "Foundation",
      "Structural",
      "Interior finishes / exterior rough work",
      "Finals punches and inspections.",
      "Pre-sale completion package",
    ]

    const getCategoryIndex = (category: string | null): number => {
      const normalized = (category || "Uncategorized").toLowerCase().trim().replace("prelliminary", "preliminary")
      const index = categoryOrder.findIndex(
        (orderCat) => orderCat.toLowerCase().trim() === normalized
      )
      return index !== -1 ? index : 999
    }

    const currentCategoryIndex = getCategoryIndex(taskCategory)

    const home = await prisma.home.findUnique({
      where: { id: homeId },
      select: { companyId: true },
    })
    const companyId = home?.companyId ?? null

    // Get category gates for this tenant only
    const categoryGates = await prisma.categoryGate.findMany({
      where: companyId != null ? { companyId } : { companyId: null },
    })

    const normalizeCategory = (c: string | null) =>
      (c || "Uncategorized").toLowerCase().trim().replace(/prelliminary/gi, "preliminary")

    // Check each category gate that comes before the current category
    for (const categoryGate of categoryGates) {
      const gateCategoryIndex = getCategoryIndex(categoryGate.categoryName)
      
      // Only check gates for categories before the current task's category
      if (gateCategoryIndex >= currentCategoryIndex) {
        continue
      }

      // Check if this gate applies
      let gateApplies = false

      if (categoryGate.gateScope === "AllScheduling") {
        gateApplies = true
      } else if (categoryGate.gateScope === "DownstreamOnly") {
        // Gate applies to tasks after this category
        gateApplies = currentCategoryIndex > gateCategoryIndex
      }

      if (gateApplies) {
        // Check if all tasks in the gated category are completed (normalized name match)
        const gateCategoryNorm = normalizeCategory(categoryGate.categoryName)
        const gatedCategoryTasks = allTasks.filter(
          (t) => normalizeCategory(t.templateItem?.optionalCategory ?? null) === gateCategoryNorm
        )

        const incompleteGatedTasks = gatedCategoryTasks.filter(
          (t) => t.status !== "Completed" && t.status !== "Canceled"
        )

        if (incompleteGatedTasks.length > 0) {
          const gateName = categoryGate.gateName || `${categoryGate.categoryName.replace(/Prelliminary/gi, "Preliminary")} Gate`
          return {
            isBlocked: true,
            blockingGateName: gateName,
            openPunchCount: incompleteGatedTasks.length,
          }
        }
      }
    }
  }

  return { isBlocked: false }
}

/**
 * Get all gate statuses for a home
 */
export async function getHomeGateStatus(homeId: string) {
  const tasks = await prisma.homeTask.findMany({
    where: { homeId },
    include: {
      templateItem: {
        select: {
          isCriticalGate: true,
          gateScope: true,
          gateName: true,
          optionalCategory: true,
        },
      },
    },
    orderBy: {
      sortOrderSnapshot: "asc",
    },
  })

  const gateTasks = tasks.filter((task) => task.templateItem?.isCriticalGate)

  const gateStatuses = await Promise.all(
    gateTasks.map(async (gateTask) => {
      const openPunchCount = await prisma.punchItem.count({
        where: {
          relatedHomeTaskId: gateTask.id,
          status: {
            in: ["Open", "ReadyForReview"],
          },
        },
      })

      return {
        taskId: gateTask.id,
        taskName: gateTask.nameSnapshot,
        gateName: gateTask.templateItem?.gateName || "Critical Gate",
        gateScope: gateTask.templateItem?.gateScope ?? GateScope.DownstreamOnly,
        sortOrder: gateTask.sortOrderSnapshot,
        isBlocked: openPunchCount > 0,
        openPunchCount,
      }
    })
  )

  return gateStatuses
}
