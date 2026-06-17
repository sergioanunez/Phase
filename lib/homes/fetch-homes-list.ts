import type { Prisma, PrismaClient } from "@prisma/client"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"
import { compareHomesByDisplayOrder, homeOrderByDisplayOrder } from "@/lib/homes/display-order"

type HomesListWhere = Prisma.HomeWhereInput

const homesListInclude = {
  _count: { select: { homePlans: true } },
  subdivision: {
    select: {
      id: true,
      name: true,
    },
  },
  tasks: {
    select: {
      id: true,
      templateItemId: true,
      status: true,
      scheduledDate: true,
      completedAt: true,
      nameSnapshot: true,
      durationDaysSnapshot: true,
      contractor: {
        select: {
          id: true,
          companyName: true,
        },
      },
      templateItem: {
        select: {
          optionalCategory: true,
          sortOrder: true,
          sequenceOrder: true,
          name: true,
        },
      },
    },
    orderBy: [...homeTaskOrderByTemplateSequence()],
  },
} satisfies Prisma.HomeInclude

/** Prisma query when Home.displayOrder exists (post-migration). */
const homesListSelectWithoutDisplayOrder = {
  id: true,
  companyId: true,
  subdivisionId: true,
  addressOrLot: true,
  startDate: true,
  targetCompletionDate: true,
  forecastCompletionDate: true,
  forecastTotalWorkingDays: true,
  forecastComputedAt: true,
  planName: true,
  planVariant: true,
  planStoragePath: true,
  planFileName: true,
  planFileType: true,
  planUploadedAt: true,
  planUploadedByUserId: true,
  thumbnailStoragePath: true,
  thumbnailFileName: true,
  isComplete: true,
  completedAt: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { homePlans: true } },
  subdivision: homesListInclude.subdivision,
  tasks: homesListInclude.tasks,
} satisfies Prisma.HomeSelect

export type HomeForList = Prisma.HomeGetPayload<{
  include: typeof homesListInclude
}>

export function isMissingHomeDisplayOrderColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /displayOrder/i.test(message) &&
    (message.includes("does not exist") ||
      message.includes("Unknown column") ||
      message.includes("P2022") ||
      message.includes("column"))
  )
}

/**
 * Load homes for list endpoints. Falls back when Home.displayOrder is not migrated yet.
 */
export async function fetchHomesForList(
  prisma: PrismaClient,
  where: HomesListWhere
): Promise<HomeForList[]> {
  try {
    return await prisma.home.findMany({
      where,
      include: homesListInclude,
      orderBy: [...homeOrderByDisplayOrder],
    })
  } catch (error) {
    if (!isMissingHomeDisplayOrderColumn(error)) throw error

    console.warn(
      "[homes] Home.displayOrder column missing; using legacy query. Apply migration 20260328120000_home_display_order."
    )

    const legacyHomes = await prisma.home.findMany({
      where,
      select: homesListSelectWithoutDisplayOrder,
      orderBy: [{ addressOrLot: "asc" }, { createdAt: "asc" }],
    })

    return legacyHomes
      .map((home) => ({ ...home, displayOrder: 0 }))
      .sort(compareHomesByDisplayOrder) as HomeForList[]
  }
}
