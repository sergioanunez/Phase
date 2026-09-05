import { differenceInCalendarDays, format, startOfDay } from "date-fns"
import { normalizeStoredScheduledDate } from "@/lib/calendar-date"

export type ScheduleStatus =
  | "completed"
  | "not_started"
  | "on_track"
  | "at_risk"
  | "behind"

/** Active portfolio chips — completed homes are excluded from these buckets. */
export type ActiveScheduleStatus = Exclude<ScheduleStatus, "completed">

export type GetScheduleStatusOptions = {
  startDate?: string | Date | null
  /** Number of task instances that have a scheduled date (construction has been scheduled). */
  scheduledTaskCount?: number
  /**
   * Authoritative home completion flag (`Home.isComplete` from recalculateHomeCompletion).
   * When true, status is always Completed — forecast/target health is not evaluated.
   */
  isComplete?: boolean
}

/**
 * True when construction has begun: at least one task is scheduled, or the home
 * start date is set and is today or earlier.
 */
export function isHomeConstructionStarted(
  startDate: string | Date | null | undefined,
  scheduledTaskCount: number,
  today = new Date()
): boolean {
  if (scheduledTaskCount > 0) return true
  if (startDate == null) return false
  const start = startOfDay(normalizeStoredScheduledDate(new Date(startDate)))
  const day = startOfDay(today)
  return start.getTime() <= day.getTime()
}

/**
 * Computes schedule status from completion, start, then forecast vs target.
 *
 * Precedence:
 * 1. isComplete => Completed
 * 2. construction not started => Not Started
 * 3. Else forecast vs target => On Track / At Risk / Behind
 */
export function getScheduleStatus(
  forecastCompletionDate: string | null,
  targetCompletionDate: string | null,
  options?: GetScheduleStatusOptions
): ScheduleStatus {
  if (options?.isComplete) {
    return "completed"
  }

  const startDate = options?.startDate
  const scheduledTaskCount = options?.scheduledTaskCount ?? 0
  const hasStarted = isHomeConstructionStarted(startDate, scheduledTaskCount)

  if (!hasStarted) {
    return "not_started"
  }

  if (!forecastCompletionDate || !targetCompletionDate) {
    return "on_track"
  }

  const forecast = new Date(forecastCompletionDate)
  const target = new Date(targetCompletionDate)

  if (forecast <= target) {
    return "on_track"
  }

  const targetPlus7 = new Date(target)
  targetPlus7.setDate(targetPlus7.getDate() + 7)

  if (forecast <= targetPlus7) {
    return "at_risk"
  }

  return "behind"
}

export type CompletionVsTargetSummary = {
  /** Short secondary line for House Details / cards */
  label: string
  /** Calendar days: positive = after target, negative = ahead, 0 = on target */
  deltaDays: number | null
}

/**
 * Historical completion vs target using the same calendar-day semantics as
 * forecast-vs-target health (differenceInCalendarDays on local start-of-day).
 * Authoritative actual date: Home.completedAt.
 */
export function formatCompletionVsTarget(
  completedAt: string | Date | null | undefined,
  targetCompletionDate: string | Date | null | undefined
): CompletionVsTargetSummary {
  if (completedAt == null) {
    return { label: "Completed", deltaDays: null }
  }
  const completed = startOfDay(normalizeStoredScheduledDate(new Date(completedAt)))
  if (Number.isNaN(completed.getTime())) {
    return { label: "Completed", deltaDays: null }
  }

  const completedLabel = `Completed ${format(completed, "MMM d")}`

  if (targetCompletionDate == null) {
    return { label: completedLabel, deltaDays: null }
  }
  const target = startOfDay(normalizeStoredScheduledDate(new Date(targetCompletionDate)))
  if (Number.isNaN(target.getTime())) {
    return { label: completedLabel, deltaDays: null }
  }

  const deltaDays = differenceInCalendarDays(completed, target)
  if (deltaDays === 0) {
    return { label: "Completed on target", deltaDays: 0 }
  }
  if (deltaDays > 0) {
    return {
      label: `Completed ${deltaDays} day${deltaDays === 1 ? "" : "s"} after target`,
      deltaDays,
    }
  }
  const ahead = Math.abs(deltaDays)
  return {
    label: `Completed ${ahead} day${ahead === 1 ? "" : "s"} ahead of target`,
    deltaDays,
  }
}
