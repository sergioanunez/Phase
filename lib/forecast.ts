import { prisma } from "./prisma"
import { addWorkingDays } from "./working-days"

type HomeTaskWithTemplate = Awaited<ReturnType<typeof getHomeWithTasks>>["tasks"][number]

async function getHomeWithTasks(homeId: string) {
  const home = await prisma.home.findUnique({
    where: { id: homeId },
    include: {
      tasks: {
        include: {
          templateItem: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { sortOrderSnapshot: "asc" },
      },
    },
  })

  if (!home) {
    throw new Error("Home not found")
  }

  return home
}

/** Compute forecast fields for a single home based on template dependencies. */
export async function computeHomeForecast(homeId: string) {
  const home = await getHomeWithTasks(homeId)

  if (!home.startDate) {
    // Without a start date we cannot compute a calendar forecast; clear fields.
    await prisma.home.update({
      where: { id: home.id },
      data: {
        forecastCompletionDate: null,
        forecastTotalWorkingDays: null,
        forecastComputedAt: new Date(),
      },
    })
    return
  }

  const tasks = home.tasks
  if (tasks.length === 0) {
    await prisma.home.update({
      where: { id: home.id },
      data: {
        forecastCompletionDate: home.startDate,
        forecastTotalWorkingDays: 0,
        forecastComputedAt: new Date(),
      },
    })
    return
  }

  // Build dependency graph from template dependencies, mapped onto this home's tasks
  const templateDependencies = await prisma.templateDependency.findMany()

  const idToTask: Record<string, HomeTaskWithTemplate> = {}
  tasks.forEach((t) => {
    idToTask[t.id] = t
  })

  const successors: Record<string, string[]> = {}
  const predecessors: Record<string, string[]> = {}

  for (const task of tasks) {
    successors[task.id] = []
    predecessors[task.id] = []
  }

  for (const dep of templateDependencies) {
    // Find corresponding tasks for this home
    const dependentTask = tasks.find((t) => t.templateItemId === dep.templateItemId)
    const prereqTask = tasks.find((t) => t.templateItemId === dep.dependsOnItemId)
    if (!dependentTask || !prereqTask) continue

    successors[prereqTask.id].push(dependentTask.id)
    predecessors[dependentTask.id].push(prereqTask.id)
  }

  // Topological sort (Kahn)
  const inDegree: Record<string, number> = {}
  for (const task of tasks) {
    inDegree[task.id] = predecessors[task.id].length
  }

  const queue: string[] = []
  for (const task of tasks) {
    if (inDegree[task.id] === 0) queue.push(task.id)
  }

  const topoOrder: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    topoOrder.push(id)
    for (const succ of successors[id]) {
      inDegree[succ] -= 1
      if (inDegree[succ] === 0) {
        queue.push(succ)
      }
    }
  }

  if (topoOrder.length !== tasks.length) {
    // Cycle detected in template dependency graph for this home
    const involved = tasks
      .filter((t) => !topoOrder.includes(t.id))
      .map((t) => t.nameSnapshot)
    throw new Error(
      `Dependency cycle detected in template items affecting this home: ${involved.join(
        ", "
      )}`
    )
  }

  // Forward pass: Early Start / Early Finish (offsets in working days)
  const ES: Record<string, number> = {}
  const EF: Record<string, number> = {}

  for (const id of topoOrder) {
    const preds = predecessors[id]
    if (preds.length === 0) {
      ES[id] = 0
    } else {
      ES[id] = Math.max(...preds.map((p) => EF[p]))
    }
    const duration = Math.max(0, idToTask[id].durationDaysSnapshot)
    EF[id] = ES[id] + duration
  }

  const totalWorkingDays = Math.max(...topoOrder.map((id) => EF[id]))

  // Backward pass for critical path (LF/LS/slack)
  const LF: Record<string, number> = {}
  const LS: Record<string, number> = {}

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i]
    const succs = successors[id]
    const duration = Math.max(0, idToTask[id].durationDaysSnapshot)

    if (succs.length === 0) {
      LF[id] = totalWorkingDays
    } else {
      const minLsOfSucc = Math.min(...succs.map((s) => LS[s]))
      LF[id] = minLsOfSucc
    }
    LS[id] = LF[id] - duration
  }

  // Persist forecast onto tasks and home
  const startDate = home.startDate
  const forecastCompletionDate = addWorkingDays(startDate, totalWorkingDays)

  await prisma.$transaction([
    ...tasks.map((task) =>
      prisma.homeTask.update({
        where: { id: task.id },
        data: {
          forecastEarlyStartOffsetWorkingDays: ES[task.id] ?? null,
          forecastEarlyFinishOffsetWorkingDays: EF[task.id] ?? null,
          isCriticalPath: ES[task.id] !== undefined && LS[task.id] !== undefined
            ? LS[task.id] - ES[task.id] === 0
            : false,
          blockedByCount: predecessors[task.id]?.length ?? 0,
        },
      })
    ),
    prisma.home.update({
      where: { id: home.id },
      data: {
        forecastTotalWorkingDays: totalWorkingDays,
        forecastCompletionDate,
        forecastComputedAt: new Date(),
      },
    }),
  ])
}

