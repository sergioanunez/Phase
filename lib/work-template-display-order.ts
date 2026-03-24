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
  createdAt?: Date
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
  const ca = a.createdAt?.getTime() ?? 0
  const cb = b.createdAt?.getTime() ?? 0
  return ca - cb
}

export function sortWorkTemplatesForDisplay<T extends WorkTemplateDisplaySortKey>(items: T[]): T[] {
  return [...items].sort(compareWorkTemplatesForDisplay)
}
