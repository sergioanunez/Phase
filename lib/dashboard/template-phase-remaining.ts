import { compareWorkTemplateCategoryNamesForAdminDisplay } from "@/lib/work-template-display-order"

export type WorkTemplateItemForRemaining = {
  defaultDurationDays: number
  optionalCategory: string | null
  workTemplateCategory: { name: string } | null
}

export type WorkTemplateCategoryRow = {
  name: string
  categoryPosition: number
}

/**
 * Category label used on HomeTask.templateItem / phase detection: category relation name wins, else optionalCategory, else Uncategorized.
 */
export function effectiveTemplateCategoryName(item: WorkTemplateItemForRemaining): string {
  const fromRel = item.workTemplateCategory?.name?.trim()
  if (fromRel) return fromRel
  return (item.optionalCategory || "").trim() || "Uncategorized"
}

/**
 * Ordered category names for phase-duration math:
 * 1) WorkTemplateCategory rows for the tenant, ascending categoryPosition then name
 * 2) Any template item category names not in that list (admin/display order)
 * 3) Any extra names (e.g. only on active homes) not yet listed
 */
export function buildOrderedTemplateCategoryNames(
  dbCategories: WorkTemplateCategoryRow[],
  items: WorkTemplateItemForRemaining[],
  extraNamesFromHomes: string[]
): string[] {
  const ordered = dbCategories
    .slice()
    .sort((a, b) =>
      a.categoryPosition !== b.categoryPosition
        ? a.categoryPosition - b.categoryPosition
        : a.name.localeCompare(b.name)
    )
    .map((c) => c.name)

  const fromItems = new Set<string>()
  for (const it of items) {
    fromItems.add(effectiveTemplateCategoryName(it))
  }

  const appendMissing = (base: string[], names: Iterable<string>): string[] => {
    const set = new Set(base)
    const missing = [...names].filter((n) => !set.has(n))
    if (missing.length === 0) return base
    missing.sort(compareWorkTemplateCategoryNamesForAdminDisplay)
    return [...base, ...missing]
  }

  let out = appendMissing(ordered, fromItems)
  out = appendMissing(out, extraNamesFromHomes)
  return out
}

/** Sum defaultDurationDays (working days) per category name. */
export function categoryDurationByName(items: WorkTemplateItemForRemaining[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    const name = effectiveTemplateCategoryName(it)
    const d = Number(it.defaultDurationDays) || 0
    m.set(name, (m.get(name) ?? 0) + d)
  }
  return m
}

/**
 * For each category in order, remaining working days from the start of that category through the end of the template:
 * sum of categoryDuration(c) for all c at the same or later index.
 */
export function cumulativeRemainingWorkingDaysByCategory(
  orderedNames: string[],
  durationByName: Map<string, number>
): { cumulativeByName: Map<string, number>; totalBuildWorkingDays: number } {
  const durations = orderedNames.map((n) => durationByName.get(n) ?? 0)
  const totalBuildWorkingDays = durations.reduce((a, b) => a + b, 0)
  const cumulativeByName = new Map<string, number>()
  for (let i = 0; i < orderedNames.length; i++) {
    let sum = 0
    for (let j = i; j < orderedNames.length; j++) sum += durations[j]
    cumulativeByName.set(orderedNames[i], sum)
  }
  return { cumulativeByName, totalBuildWorkingDays }
}
