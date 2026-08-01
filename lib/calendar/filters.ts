/**
 * Generic Calendar query filters.
 * Add new keys here as filters are introduced (community, superintendent, phase, etc.).
 * APIs parse these from search params; the UI owns selection state separately.
 */

export type CalendarFilterKey =
  | "contractorId"
  | "subdivisionId"
  | "superintendentId"
  | "houseStatus"
  | "builderId"
  | "phase"
  | "inspectionType"

export type CalendarQueryFilters = {
  contractorId?: string
  subdivisionId?: string
  superintendentId?: string
  houseStatus?: string
  builderId?: string
  phase?: string
  inspectionType?: string
}

const FILTER_PARAM_KEYS: CalendarFilterKey[] = [
  "contractorId",
  "subdivisionId",
  "superintendentId",
  "houseStatus",
  "builderId",
  "phase",
  "inspectionType",
]

export function parseCalendarQueryFilters(
  searchParams: URLSearchParams
): CalendarQueryFilters {
  const filters: CalendarQueryFilters = {}
  for (const key of FILTER_PARAM_KEYS) {
    const value = searchParams.get(key)?.trim()
    if (value) filters[key] = value
  }
  return filters
}

/** Append known filters onto a URLSearchParams builder (client fetch). */
export function appendCalendarQueryFilters(
  params: URLSearchParams,
  filters: CalendarQueryFilters
): void {
  for (const key of FILTER_PARAM_KEYS) {
    const value = filters[key]
    if (value) params.set(key, value)
  }
}

/**
 * Prisma `where` fragments for HomeTask calendar queries.
 * Keep filter → where mapping here so route handlers stay thin.
 */
export function homeTaskWhereFromCalendarFilters(
  filters: CalendarQueryFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = {}

  if (filters.contractorId) {
    where.contractorId = filters.contractorId
  }

  if (filters.subdivisionId) {
    where.home = { ...(where.home as object), subdivisionId: filters.subdivisionId }
  }

  // Future: superintendentId → home.assignments, phase → template category, etc.

  return where
}

/**
 * Prisma `where` fragments for PunchItem calendar queries.
 * Punch items inherit contractor via relatedHomeTask.
 */
export function punchItemWhereFromCalendarFilters(
  filters: CalendarQueryFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = {}

  if (filters.contractorId) {
    where.relatedHomeTask = { contractorId: filters.contractorId }
  }

  if (filters.subdivisionId) {
    where.home = { ...(where.home as object), subdivisionId: filters.subdivisionId }
  }

  return where
}
