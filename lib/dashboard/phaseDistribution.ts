export const NOT_STARTED_PHASE_KEY = "not_started"
export const COMPLETE_PHASE_KEY = "complete"

export type DashboardTaskForPhase = {
  id: string
  status: string
  scheduledDate: Date | null
  templateItem: {
    name: string
    optionalCategory: string | null
    sortOrder: number
  }
}

export type DashboardHomeForPhase = {
  id: string
  addressOrLot: string
  startDate: Date | null
  createdAt: Date
  isComplete: boolean
  tasks: DashboardTaskForPhase[]
  /** If present, used for phase average remaining working days to completion. */
  forecastCompletionDate?: Date | null
}

export type PhaseCategory = {
  key: string
  name: string
}

export type PhaseRow = {
  key: string
  name: string
  count: number
  /** Average remaining working days to full completion; null if no forecast data in phase. */
  avgRemainingDays: number | null
}

export type PhaseDistributionResult = {
  phases: PhaseRow[]
  totalActiveHomes: number
  hasTemplate: boolean
}

export function makeCategoryPhaseKey(name: string): string {
  return `category:${name}`
}

import { workingDaysBetween } from "@/lib/forecast"

/**
 * Derive ordered phase categories from template items used by the tenant.
 * Uses the minimum sortOrder of items in each category as the ordering key.
 */
export function deriveOrderedCategories(homes: DashboardHomeForPhase[]): PhaseCategory[] {
  const categoryMeta = new Map<
    string,
    {
      name: string
      firstSortOrder: number
    }
  >()

  for (const home of homes) {
    for (const task of home.tasks) {
      const rawName = (task.templateItem.optionalCategory || "").trim()
      if (!rawName) continue
      const sort = task.templateItem.sortOrder
      const existing = categoryMeta.get(rawName)
      if (!existing || sort < existing.firstSortOrder) {
        categoryMeta.set(rawName, { name: rawName, firstSortOrder: sort })
      }
    }
  }

  return Array.from(categoryMeta.values())
    .sort((a, b) => a.firstSortOrder - b.firstSortOrder)
    .map((c) => ({ key: makeCategoryPhaseKey(c.name), name: c.name }))
}

export type CurrentPhase = {
  key: string
  name: string
}

/**
 * Compute the current phase for a home.
 *
 * Rules:
 * - "Not started" when:
 *   - There are no tasks, OR
 *   - The home has no startDate AND no scheduled tasks.
 * - "Complete" when the home has tasks and all are Completed.
 * - Otherwise, first template category (in orderedCategories) that has any
 *   task with status !== Completed.
 */
export function computeCurrentPhaseForHome(
  home: DashboardHomeForPhase,
  orderedCategories: PhaseCategory[]
): CurrentPhase {
  const tasks = home.tasks ?? []
  const hasTasks = tasks.length > 0
  const hasStartDate = !!home.startDate
  const hasScheduled = tasks.some((t) => t.scheduledDate != null)

  const notStarted = !hasTasks || (!hasStartDate && !hasScheduled)
  if (notStarted) {
    return { key: NOT_STARTED_PHASE_KEY, name: "Not started" }
  }

  const allCompleted = hasTasks && tasks.every((t) => t.status === "Completed")
  if (allCompleted) {
    return { key: COMPLETE_PHASE_KEY, name: "Complete" }
  }

  for (const category of orderedCategories) {
    const categoryName = category.name
    const hasAnyInCategory = tasks.some(
      (t) => (t.templateItem.optionalCategory || "").trim() === categoryName
    )
    if (!hasAnyInCategory) continue
    const hasIncompleteInCategory = tasks.some(
      (t) =>
        (t.templateItem.optionalCategory || "").trim() === categoryName &&
        t.status !== "Completed"
    )
    if (hasIncompleteInCategory) {
      return { key: category.key, name: category.name }
    }
  }

  // Fallback: if no category matched, treat as Complete.
  return { key: COMPLETE_PHASE_KEY, name: "Complete" }
}

/**
 * Compute phase distribution for a set of active homes.
 * Homes should already be scoped to the tenant and active (isComplete = false).
 */
export function computePhaseDistribution(homes: DashboardHomeForPhase[]): PhaseDistributionResult {
  const totalActiveHomes = homes.length
  const orderedCategories = deriveOrderedCategories(homes)
  const hasTemplate = orderedCategories.length > 0

  const counts = new Map<string, { name: string; count: number }>()

  for (const home of homes) {
    const phase = computeCurrentPhaseForHome(home, orderedCategories)
    const existing = counts.get(phase.key)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(phase.key, { name: phase.name, count: 1 })
    }
  }

  const phases: PhaseRow[] = []

  // Not started at top
  const notStarted = counts.get(NOT_STARTED_PHASE_KEY)
  if (notStarted && notStarted.count > 0) {
    phases.push({
      key: NOT_STARTED_PHASE_KEY,
      name: notStarted.name,
      count: notStarted.count,
      avgRemainingDays: null,
    })
  }

  // Template categories in order
  for (const category of orderedCategories) {
    const row = counts.get(category.key)
    if (row && row.count > 0) {
      phases.push({
        key: category.key,
        name: row.name,
        count: row.count,
        avgRemainingDays: null,
      })
    }
  }

  // Complete at bottom
  const complete = counts.get(COMPLETE_PHASE_KEY)
  if (complete && complete.count > 0) {
    phases.push({
      key: COMPLETE_PHASE_KEY,
      name: complete.name,
      count: complete.count,
      avgRemainingDays: null,
    })
  }

  return {
    phases,
    totalActiveHomes,
    hasTemplate,
  }
}

/**
 * Compute average remaining working days to full completion per phase.
 * Uses existing forecast completion dates; excludes homes with no forecast.
 * Returns a map from phase key to rounded average, or null if no homes in that phase have forecast.
 */
export function computePhaseAverageRemainingDays(
  homes: DashboardHomeForPhase[],
  orderedCategories: PhaseCategory[]
): Map<string, number | null> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const byPhase = new Map<string, { sum: number; count: number }>()

  for (const home of homes) {
    const phase = computeCurrentPhaseForHome(home, orderedCategories)
    const raw = home.forecastCompletionDate
    const forecast =
      raw instanceof Date ? raw : raw != null ? new Date(raw) : null
    if (!forecast) continue
    const remaining =
      forecast <= today ? 0 : Math.round(workingDaysBetween(today, forecast))
    const cur = byPhase.get(phase.key)
    if (cur) {
      cur.sum += remaining
      cur.count += 1
    } else {
      byPhase.set(phase.key, { sum: remaining, count: 1 })
    }
  }

  const result = new Map<string, number | null>()
  byPhase.forEach(({ sum, count }, key) => {
    result.set(key, count > 0 ? Math.round(sum / count) : null)
  })
  return result
}

