import { prisma } from "./prisma"
import { checkGateBlocking } from "./gates"

const CATEGORY_ORDER = [
  "Preliminary work",
  "Foundation",
  "Structural",
  "Interior finishes / exterior rough work",
  "Finals punches and inspections.",
  "Pre-sale completion package",
]

function getCategoryIndex(category: string | null): number {
  const normalized = (category || "Uncategorized")
    .toLowerCase()
    .trim()
    .replace("prelliminary", "preliminary")
  const index = CATEGORY_ORDER.findIndex(
    (orderCat) => orderCat.toLowerCase().trim() === normalized
  )
  return index !== -1 ? index : 999
}

export type TaskForBlockCheck = {
  id: string
  templateItemId: string
  sortOrderSnapshot: number
  nameSnapshot: string
  status: string
  templateItem: {
    optionalCategory: string | null
    isDependency: boolean
  } | null
}

/**
 * Returns the human-readable reason why scheduling this task is blocked, or null if not blocked.
 * Matches the same checks as PATCH /api/tasks/[id] when setting scheduledDate.
 */
export async function getTaskSchedulingBlockReason(
  homeId: string,
  taskId: string,
  allTasks: TaskForBlockCheck[]
): Promise<string | null> {
  const currentTask = allTasks.find((t) => t.id === taskId)
  if (!currentTask) return null

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { companyId: true },
  })
  const companyId = home?.companyId ?? null

  // 1. Template-level dependencies (include null companyId so Admin-created deps apply)
  const templateDeps = await prisma.templateDependency.findMany({
    where: {
      templateItemId: currentTask.templateItemId,
      OR: companyId
        ? [{ companyId }, { companyId: null }]
        : [{ companyId: null }],
    },
  })
  if (templateDeps.length > 0) {
    const prereqTasks = allTasks.filter((t) =>
      templateDeps.some((d) => d.dependsOnItemId === t.templateItemId)
    )
    const incompletePrereqs = prereqTasks.filter((t) => t.status !== "Completed")
    if (incompletePrereqs.length > 0) {
      const names = incompletePrereqs.map((t) => t.nameSnapshot).join(", ")
      return `Task blocked until prerequisites are completed: ${names}`
    }
  }

  const currentTaskCategory =
    currentTask.templateItem?.optionalCategory || "Uncategorized"
  const currentTaskIndex = allTasks.findIndex((t) => t.id === taskId)
  const currentCategoryIndex = getCategoryIndex(currentTaskCategory)

  // 2. Category gates (tenant-scoped)
  const categoryGates = await prisma.categoryGate.findMany({
    where:
      companyId != null ? { companyId } : { companyId: null },
  })
  const normalizeCategory = (c: string | null) =>
    (c || "Uncategorized").toLowerCase().trim().replace(/prelliminary/gi, "preliminary")
  for (const categoryGate of categoryGates) {
    const gateCategoryIndex = getCategoryIndex(categoryGate.categoryName)
    if (gateCategoryIndex >= currentCategoryIndex) continue

    let gateApplies = false
    if (categoryGate.gateScope === "AllScheduling") {
      gateApplies = true
    } else if (categoryGate.gateScope === "DownstreamOnly") {
      gateApplies = currentCategoryIndex > gateCategoryIndex
    }
    if (!gateApplies) continue

    const gateCategoryNorm = normalizeCategory(categoryGate.categoryName)
    const gatedCategoryTasks = allTasks.filter(
      (task) =>
        normalizeCategory(task.templateItem?.optionalCategory ?? null) === gateCategoryNorm
    )
    const incompleteGatedTasks = gatedCategoryTasks.filter(
      (task) => task.status !== "Completed" && task.status !== "Canceled"
    )
    if (incompleteGatedTasks.length > 0) {
      const gateName =
        categoryGate.gateName ||
        `${categoryGate.categoryName.replace(/Prelliminary/gi, "Preliminary")} Gate`
      const taskNames = incompleteGatedTasks
        .map((t) => t.nameSnapshot)
        .join(", ")
      return `Cannot schedule this task. All tasks in "${gateName}" must be completed first: ${taskNames}`
    }
  }

  // 3. Previous dependency tasks (isDependency)
  const previousDependencyTasks = allTasks
    .slice(0, currentTaskIndex)
    .filter((task) => task.templateItem?.isDependency)
  const incompleteDependencies = previousDependencyTasks.filter(
    (task) => task.status !== "Completed"
  )
  if (incompleteDependencies.length > 0) {
    const dependencyNames = incompleteDependencies
      .map((t) => t.nameSnapshot)
      .join(", ")
    return `Cannot schedule this task. The following dependency tasks must be completed first: ${dependencyNames}`
  }

  // 4. Critical gate punch items
  const gateCheck = await checkGateBlocking(
    homeId,
    taskId,
    currentTask.sortOrderSnapshot
  )
  if (gateCheck.isBlocked) {
    return `Scheduling blocked until "${gateCheck.blockingGateName}" punchlist is cleared. ${gateCheck.openPunchCount} open punch item(s) remaining.`
  }

  return null
}

/**
 * Batch version: fetch shared data once, then compute block reasons for all tasks.
 * Use this in the forecast API to avoid N+1 queries (category gates, template deps, gate blocking).
 */
export async function getTaskSchedulingBlockReasonsBatch(
  homeId: string,
  allTasks: TaskForBlockCheck[]
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()
  if (allTasks.length === 0) return results

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { companyId: true },
  })
  const companyId = home?.companyId ?? null

  const [categoryGates, allTemplateDeps, homeTasksWithGates] = await Promise.all([
    prisma.categoryGate.findMany({
      where:
        companyId != null ? { companyId } : { companyId: null },
    }),
    prisma.templateDependency.findMany({
      where: {
        templateItemId: {
          in: [...new Set(allTasks.map((t) => t.templateItemId))],
        },
        OR: companyId
          ? [{ companyId }, { companyId: null }]
          : [{ companyId: null }],
      },
    }),
    prisma.homeTask.findMany({
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
      orderBy: { sortOrderSnapshot: "asc" },
    }),
  ])

  const gateTasks = homeTasksWithGates.filter((t) => t.templateItem?.isCriticalGate)
  const gateTaskIds = gateTasks.map((t) => t.id)
  let openPunchCountByTaskId: Record<string, number> = {}
  if (gateTaskIds.length > 0) {
    const openPunchItems = await prisma.punchItem.findMany({
      where: {
        relatedHomeTaskId: { in: gateTaskIds },
        status: { in: ["Open", "ReadyForReview"] },
      },
      select: { relatedHomeTaskId: true },
    })
    for (const p of openPunchItems) {
      if (p.relatedHomeTaskId) {
        openPunchCountByTaskId[p.relatedHomeTaskId] =
          (openPunchCountByTaskId[p.relatedHomeTaskId] ?? 0) + 1
      }
    }
  }

  const templateDepsByTemplateItemId = new Map<string, { dependsOnItemId: string }[]>()
  for (const d of allTemplateDeps) {
    const list = templateDepsByTemplateItemId.get(d.templateItemId) ?? []
    list.push({ dependsOnItemId: d.dependsOnItemId })
    templateDepsByTemplateItemId.set(d.templateItemId, list)
  }

  for (const currentTask of allTasks) {
    const currentTaskIndex = allTasks.findIndex((t) => t.id === currentTask.id)
    const currentTaskCategory =
      currentTask.templateItem?.optionalCategory || "Uncategorized"
    const currentCategoryIndex = getCategoryIndex(currentTaskCategory)

    // 1. Template-level dependencies
    const templateDeps = templateDepsByTemplateItemId.get(currentTask.templateItemId) ?? []
    if (templateDeps.length > 0) {
      const prereqTasks = allTasks.filter((t) =>
        templateDeps.some((d) => d.dependsOnItemId === t.templateItemId)
      )
      const incompletePrereqs = prereqTasks.filter((t) => t.status !== "Completed")
      if (incompletePrereqs.length > 0) {
        results.set(
          currentTask.id,
          `Task blocked until prerequisites are completed: ${incompletePrereqs.map((t) => t.nameSnapshot).join(", ")}`
        )
        continue
      }
    }

    // 2. Category gates
    const normalizeCategory = (c: string | null) =>
      (c || "Uncategorized").toLowerCase().trim().replace(/prelliminary/gi, "preliminary")
    let categoryBlockReason: string | null = null
    for (const categoryGate of categoryGates) {
      const gateCategoryIndex = getCategoryIndex(categoryGate.categoryName)
      if (gateCategoryIndex >= currentCategoryIndex) continue
      let gateApplies = false
      if (categoryGate.gateScope === "AllScheduling") gateApplies = true
      else if (categoryGate.gateScope === "DownstreamOnly")
        gateApplies = currentCategoryIndex > gateCategoryIndex
      if (!gateApplies) continue
      const gateCategoryNorm = normalizeCategory(categoryGate.categoryName)
      const gatedCategoryTasks = allTasks.filter(
        (task) =>
          normalizeCategory(task.templateItem?.optionalCategory ?? null) === gateCategoryNorm
      )
      const incompleteGatedTasks = gatedCategoryTasks.filter(
        (task) => task.status !== "Completed" && task.status !== "Canceled"
      )
      if (incompleteGatedTasks.length > 0) {
        const gateName =
          categoryGate.gateName ||
          `${categoryGate.categoryName.replace(/Prelliminary/gi, "Preliminary")} Gate`
        categoryBlockReason = `Cannot schedule this task. All tasks in "${gateName}" must be completed first: ${incompleteGatedTasks.map((t) => t.nameSnapshot).join(", ")}`
        break
      }
    }
    if (categoryBlockReason) {
      results.set(currentTask.id, categoryBlockReason)
      continue
    }

    // 3. Previous dependency tasks (isDependency)
    const previousDependencyTasks = allTasks
      .slice(0, currentTaskIndex)
      .filter((task) => task.templateItem?.isDependency)
    const incompleteDependencies = previousDependencyTasks.filter(
      (task) => task.status !== "Completed"
    )
    if (incompleteDependencies.length > 0) {
      results.set(
        currentTask.id,
        `Cannot schedule this task. The following dependency tasks must be completed first: ${incompleteDependencies.map((t) => t.nameSnapshot).join(", ")}`
      )
      continue
    }

    // 4. Critical gate punch items (using pre-fetched homeTasksWithGates and openPunchCountByTaskId)
    let gateBlockReason: string | null = null
    for (const gateTask of gateTasks) {
      const gateScope = gateTask.templateItem?.gateScope || "DownstreamOnly"
      const gateName = gateTask.templateItem?.gateName || "Critical Gate"
      let gateApplies = false
      if (gateScope === "AllScheduling") gateApplies = true
      else if (gateScope === "DownstreamOnly")
        gateApplies = currentTask.sortOrderSnapshot > gateTask.sortOrderSnapshot
      if (!gateApplies) continue
      const openPunchCount = openPunchCountByTaskId[gateTask.id] ?? 0
      if (openPunchCount > 0) {
        gateBlockReason = `Scheduling blocked until "${gateName}" punchlist is cleared. ${openPunchCount} open punch item(s) remaining.`
        break
      }
    }
    if (gateBlockReason) {
      results.set(currentTask.id, gateBlockReason)
      continue
    }

    results.set(currentTask.id, null)
  }

  return results
}
