import type { PrismaClient } from "@prisma/client"
import { workTemplateItemWhereForTenant } from "@/lib/work-template-tenant-scope"
import {
  buildOrderedTemplateCategoryNames,
  categoryCriticalPathDurationByName,
  cumulativeRemainingWorkingDaysByCategory,
  dedupePreserveOrder,
} from "@/lib/dashboard/template-phase-remaining"

export type TenantTemplatePhaseData = {
  /** Deduped category order (matches cumulative map keys). */
  orderedTemplateCategoryNames: string[]
  durationByCategory: Map<string, number>
  cumulativeByCategoryName: Map<string, number>
  totalBuildWorkingDays: number | null
}

/**
 * Template category maps for forecast floor (same basis as Construction Timeline / admin).
 * @param extraCategoryNames optional names from `deriveOrderedCategories(home)` so task-only categories stay ordered like the dashboard.
 */
export async function getTenantTemplateForecastPhaseData(
  prisma: PrismaClient,
  companyId: string,
  extraCategoryNames: string[] = []
): Promise<TenantTemplatePhaseData | null> {
  const [dbTemplateCategories, templateItems] = await Promise.all([
    prisma.workTemplateCategory.findMany({
      where: { companyId },
      orderBy: [{ categoryPosition: "asc" }, { name: "asc" }],
      select: { name: true, categoryPosition: true },
    }),
    prisma.workTemplateItem.findMany({
      where: workTemplateItemWhereForTenant(companyId),
      select: {
        id: true,
        defaultDurationDays: true,
        optionalCategory: true,
        workTemplateCategory: { select: { name: true } },
        dependencies: { select: { dependsOnItemId: true } },
      },
    }),
  ])

  if (templateItems.length === 0) return null

  const itemsForLib = templateItems.map((t) => ({
    id: t.id,
    defaultDurationDays: t.defaultDurationDays,
    optionalCategory: t.optionalCategory,
    workTemplateCategory: t.workTemplateCategory,
    dependencies: t.dependencies,
  }))

  const orderedRaw = buildOrderedTemplateCategoryNames(
    dbTemplateCategories,
    itemsForLib,
    extraCategoryNames
  )
  const orderedTemplateCategoryNames = dedupePreserveOrder(orderedRaw)

  const durationByCategory = categoryCriticalPathDurationByName(itemsForLib)
  const { cumulativeByName: cumulativeByCategoryName, totalBuildWorkingDays } =
    cumulativeRemainingWorkingDaysByCategory(orderedTemplateCategoryNames, durationByCategory)

  return {
    orderedTemplateCategoryNames,
    durationByCategory,
    cumulativeByCategoryName,
    totalBuildWorkingDays: totalBuildWorkingDays > 0 ? totalBuildWorkingDays : null,
  }
}

/**
 * Single number: sum of per-category critical-path durations (full template length).
 */
export async function getTenantFullTemplateBuildWorkingDays(
  prisma: PrismaClient,
  companyId: string
): Promise<number | null> {
  const data = await getTenantTemplateForecastPhaseData(prisma, companyId, [])
  return data?.totalBuildWorkingDays ?? null
}
