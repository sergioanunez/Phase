import type { PrismaClient } from "@prisma/client"
import { isTaskResolvedForScheduling } from "@/lib/task-status"

type GetIncompletePrereqsInput = {
  prisma: PrismaClient
  homeId: string
  templateItemId: string
  companyId: string | null
}

/**
 * Returns prerequisite dependency task names that are NOT yet Completed.
 * Used to gate execution (InProgress) and completion (Completed).
 */
export async function getIncompletePrerequisiteDependencyNames({
  prisma,
  homeId,
  templateItemId,
  companyId,
}: GetIncompletePrereqsInput): Promise<string[]> {
  const templateDeps = await prisma.templateDependency.findMany({
    where: {
      templateItemId,
      OR: companyId ? [{ companyId }, { companyId: null }] : [{ companyId: null }],
    },
    select: { dependsOnItemId: true },
  })

  if (templateDeps.length === 0) return []

  const prereqTasks = await prisma.homeTask.findMany({
    where: {
      homeId,
      templateItemId: { in: templateDeps.map((d) => d.dependsOnItemId) },
    },
    select: { nameSnapshot: true, status: true },
  })

  return prereqTasks
    .filter((t) => !isTaskResolvedForScheduling(t.status))
    .map((t) => t.nameSnapshot)
}

