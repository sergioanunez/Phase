import type { PrismaClient } from "@prisma/client"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"
import type { ScheduleTaskInput } from "@/lib/homes/generate-schedule"

export async function loadHomeForScheduleGeneration(
  prisma: PrismaClient,
  homeId: string,
  companyId: string
) {
  return prisma.home.findFirst({
    where: {
      id: homeId,
      OR: [
        { companyId },
        { companyId: null, subdivision: { companyId } },
      ],
    },
    select: {
      id: true,
      companyId: true,
      addressOrLot: true,
      startDate: true,
      planName: true,
      planVariant: true,
      subdivision: { select: { name: true } },
      tasks: {
        orderBy: [...homeTaskOrderByTemplateSequence()],
        select: {
          id: true,
          templateItemId: true,
          nameSnapshot: true,
          durationDaysSnapshot: true,
          status: true,
          scheduledDate: true,
          completedAt: true,
          isCriticalPath: true,
          templateItem: {
            select: {
              optionalCategory: true,
              isCriticalGate: true,
            },
          },
          contractor: { select: { companyName: true } },
        },
      },
    },
  })
}

export function mapTasksForScheduleGeneration(
  tasks: NonNullable<Awaited<ReturnType<typeof loadHomeForScheduleGeneration>>>["tasks"]
): ScheduleTaskInput[] {
  return tasks.map((t) => ({
    id: t.id,
    templateItemId: t.templateItemId,
    nameSnapshot: t.nameSnapshot,
    durationDaysSnapshot: t.durationDaysSnapshot,
    status: t.status,
    scheduledDate: t.scheduledDate,
    completedAt: t.completedAt,
    isCriticalPath: t.isCriticalPath,
    templateItem: t.templateItem,
    contractor: t.contractor,
  }))
}

export async function loadTemplateDepsForHome(
  prisma: PrismaClient,
  companyId: string | null
) {
  return prisma.templateDependency.findMany({
    where: { OR: companyId ? [{ companyId }, { companyId: null }] : [{ companyId: null }] },
    select: { templateItemId: true, dependsOnItemId: true },
  })
}

export async function assertHomeScheduleAccess(
  prisma: PrismaClient,
  homeId: string,
  userId: string,
  role: string
): Promise<boolean> {
  if (role !== "Superintendent") return true
  const assignment = await prisma.homeAssignment.findFirst({
    where: { homeId, superintendentUserId: userId },
    select: { id: true },
  })
  return assignment != null
}
