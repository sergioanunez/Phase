import { compareWorkTemplateCategoryNamesForAdminDisplay } from "@/lib/work-template-display-order"
import { computeCategoryCriticalPathDuration } from "@/lib/scheduling/categoryDuration"

export type WorkTemplateItemForRemaining = {
  id: string
  defaultDurationDays: number
  optionalCategory: string | null
  workTemplateCategory: { name: string } | null
  dependencies?: Array<{ dependsOnItemId: string }>
}

export type WorkTemplateCategoryRow = {
  name: string
  categoryPosition: number
}

/**
 * Must match `computeCurrentPhaseForHome` / `deriveOrderedCategories` task bucketing
 * (`templateItem.optionalCategory` snapshot on homes).
 */
export function phaseBucketNameForPhaseMatch(item: { optionalCategory: string | null }): string {
  return (item.optionalCategory || "").trim() || "Uncategorized"
}

export function dedupePreserveOrder(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
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
    fromItems.add(phaseBucketNameForPhaseMatch(it))
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

/**
 * Per phase bucket: longest in-category dependency chain (same as Admin → Work Items
 * `computeCategoryCriticalPathDuration`). Parallel tasks do not add their durations together.
 */
export function categoryCriticalPathDurationByName(
  items: WorkTemplateItemForRemaining[]
): Map<string, number> {
  const byName = new Map<string, WorkTemplateItemForRemaining[]>()
  for (const it of items) {
    const name = phaseBucketNameForPhaseMatch(it)
    const arr = byName.get(name) ?? []
    arr.push(it)
    byName.set(name, arr)
  }
  const m = new Map<string, number>()
  for (const [name, group] of byName) {
    const cp = computeCategoryCriticalPathDuration(
      group.map((t) => ({
        id: t.id,
        defaultDurationDays: t.defaultDurationDays,
        dependencies: t.dependencies,
      }))
    )
    if (cp != null) {
      m.set(name, cp)
      continue
    }
    const sum = group.reduce((s, t) => s + (Number(t.defaultDurationDays) || 0), 0)
    m.set(name, sum)
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
  const uniqueOrder = dedupePreserveOrder(orderedNames)
  const durations = uniqueOrder.map((n) => durationByName.get(n) ?? 0)
  const totalBuildWorkingDays = durations.reduce((a, b) => a + b, 0)
  const cumulativeByName = new Map<string, number>()
  for (let i = 0; i < uniqueOrder.length; i++) {
    let sum = 0
    for (let j = i; j < uniqueOrder.length; j++) sum += durations[j]
    cumulativeByName.set(uniqueOrder[i], sum)
  }
  return { cumulativeByName, totalBuildWorkingDays }
}
