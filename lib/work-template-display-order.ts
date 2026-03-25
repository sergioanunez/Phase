/**
 * Consistent ordering for WorkTemplateItem across Settings, schedules, Flow tie-breakers, etc.
 * 1) sequenceOrder NOT NULL, ascending
 * 2) sequenceOrder NULL last, then optionalCategory, sortOrder, name, createdAt
 */

export type WorkTemplateDisplaySortKey = {
  /** Omitted on older API payloads until refreshed; treat like null for ordering. */
  sequenceOrder?: number | null
  optionalCategory: string | null
  sortOrder: number
  name: string
  createdAt?: Date | string
}

/** Category stack for Work Items accordion and default execution flatten (matches admin UI). */
export const WORK_TEMPLATE_CATEGORY_DISPLAY_ORDER = [
  "Preliminary work",
  "Foundation",
  "Structural",
  "Interior finishes / exterior rough work",
  "Finals punches and inspections.",
  "Pre-sale completion package",
] as const

function createdAtMs(key: WorkTemplateDisplaySortKey): number {
  const c = key.createdAt
  if (c == null) return 0
  if (c instanceof Date) return c.getTime()
  if (typeof c === "string" || typeof c === "number") {
    const t = new Date(c).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

/**
 * Sort category names like the admin Work Items accordion (preliminary first, then known stack, then alpha).
 */
export function compareWorkTemplateCategoryNamesForAdminDisplay(a: string, b: string): number {
  const aLower = a.toLowerCase().trim()
  const bLower = b.toLowerCase().trim()
  const aNormalized = aLower.replace("prelliminary", "preliminary")
  const bNormalized = bLower.replace("prelliminary", "preliminary")
  const aIsPreliminary = aNormalized.includes("preliminary")
  const bIsPreliminary = bNormalized.includes("preliminary")
  if (aIsPreliminary && !bIsPreliminary) return -1
  if (!aIsPreliminary && bIsPreliminary) return 1
  if (aIsPreliminary && bIsPreliminary) return a.localeCompare(b)

  const order = WORK_TEMPLATE_CATEGORY_DISPLAY_ORDER
  const aIndex = order.findIndex((o) => o.toLowerCase().trim() === aLower)
  const bIndex = order.findIndex((o) => o.toLowerCase().trim() === bLower)
  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
  if (aIndex !== -1) return -1
  if (bIndex !== -1) return 1
  return a.localeCompare(b)
}

/**
 * Single global list: fixed category order, then per-category template order (sequence → sortOrder → name).
 * Matches non–reorder-mode admin accordion flattening (execution narrative).
 */
export function flattenWorkTemplatesForAdminExecutionOrder<
  T extends WorkTemplateDisplaySortKey & { id: string },
>(items: T[]): T[] {
  if (items.length === 0) return []
  const byCategory: Record<string, T[]> = {}
  for (const t of items) {
    const cat = (t.optionalCategory || "Uncategorized").trim() || "Uncategorized"
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(t)
  }
  const sortedCategories = Object.keys(byCategory).sort(compareWorkTemplateCategoryNamesForAdminDisplay)
  const out: T[] = []
  for (const cat of sortedCategories) {
    out.push(...sortWorkTemplatesForDisplay(byCategory[cat]))
  }
  return out
}

/**
 * Reorder-mode initial order: if every item has sequenceOrder, sort by that (global saved order).
 * Otherwise use flattened admin execution order (category stack + sortOrder), not alphabetical categories.
 */
export function getWorkTemplatesInitialReorderList<T extends WorkTemplateDisplaySortKey & { id: string }>(
  items: T[]
): T[] {
  if (items.length === 0) return []
  const allHaveSequence = items.every((t) => t.sequenceOrder != null)
  if (allHaveSequence) {
    return [...items].sort((a, b) => {
      const d = (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0)
      if (d !== 0) return d
      return a.name.localeCompare(b.name)
    })
  }
  return flattenWorkTemplatesForAdminExecutionOrder(items)
}

/** Dev/client validation: unique ids and stable list length. */
export function logWorkTemplateReorderListValidation(orderedIds: string[], context: string): void {
  const unique = new Set(orderedIds)
  if (unique.size !== orderedIds.length) {
    const seen = new Set<string>()
    const duplicates = orderedIds.filter((id) => {
      if (seen.has(id)) return true
      seen.add(id)
      return false
    })
    console.warn(`[work-template-reorder:${context}] duplicate template ids in order`, {
      duplicates,
      length: orderedIds.length,
      uniqueCount: unique.size,
    })
  }
  if (process.env.NODE_ENV === "development") {
    console.debug(`[work-template-reorder:${context}] order ok`, {
      count: orderedIds.length,
      unique: unique.size,
    })
  }
}

/** Prisma orderBy for PostgreSQL (nulls last on sequenceOrder). */
export function workTemplatePrismaOrderBy(): Array<
  | { sequenceOrder: { sort: "asc"; nulls: "last" } }
  | { optionalCategory: "asc" }
  | { sortOrder: "asc" }
  | { name: "asc" }
> {
  return [
    { sequenceOrder: { sort: "asc", nulls: "last" } },
    { optionalCategory: "asc" },
    { sortOrder: "asc" },
    { name: "asc" },
  ]
}

/** HomeTask list: template sequence first, then legacy snapshot order. */
export function homeTaskOrderByTemplateSequence(): Array<
  | { templateItem: { sequenceOrder: { sort: "asc"; nulls: "last" } } }
  | { sortOrderSnapshot: "asc" }
  | { nameSnapshot: "asc" }
> {
  return [
    { templateItem: { sequenceOrder: { sort: "asc", nulls: "last" } } },
    { sortOrderSnapshot: "asc" },
    { nameSnapshot: "asc" },
  ]
}

export function compareWorkTemplatesForDisplay(
  a: WorkTemplateDisplaySortKey,
  b: WorkTemplateDisplaySortKey
): number {
  const aSeq = a.sequenceOrder
  const bSeq = b.sequenceOrder
  const aHas = aSeq != null
  const bHas = bSeq != null
  if (aHas && bHas && aSeq !== bSeq) return aSeq - bSeq
  if (aHas && !bHas) return -1
  if (!aHas && bHas) return 1

  const catA = (a.optionalCategory ?? "").toLowerCase()
  const catB = (b.optionalCategory ?? "").toLowerCase()
  if (catA !== catB) return catA.localeCompare(catB)
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  const nameCmp = a.name.localeCompare(b.name)
  if (nameCmp !== 0) return nameCmp
  return createdAtMs(a) - createdAtMs(b)
}

export function sortWorkTemplatesForDisplay<T extends WorkTemplateDisplaySortKey>(items: T[]): T[] {
  return [...items].sort(compareWorkTemplatesForDisplay)
}
