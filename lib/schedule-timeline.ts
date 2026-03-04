import { differenceInDays, differenceInCalendarDays, startOfDay } from "date-fns"

/**
 * Delta in calendar days: forecast − target.
 * Negative = ahead, zero = on time, positive = behind.
 */
export function getDeltaDays(forecastDate: Date, targetDate: Date): number {
  const forecast = startOfDay(forecastDate)
  const target = startOfDay(targetDate)
  return differenceInCalendarDays(forecast, target)
}

/**
 * Forecast position as percent of Start→Target (0–100).
 * total = target - start, elapsed = forecast - start, percent = clamp(100 * elapsed / total, 0, 100).
 */
export function getForecastPercent(
  startDate: Date,
  targetDate: Date,
  forecastDate: Date
): number {
  const start = startOfDay(startDate)
  const target = startOfDay(targetDate)
  const forecast = startOfDay(forecastDate)
  const total = Math.max(1, differenceInCalendarDays(target, start))
  const elapsed = differenceInCalendarDays(forecast, start)
  const percent = (elapsed / total) * 100
  return Math.min(100, Math.max(0, percent))
}

export type ScheduleStatus = "ahead" | "on-time" | "behind"

export function getScheduleStatus(deltaDays: number): ScheduleStatus {
  if (deltaDays < 0) return "ahead"
  if (deltaDays > 0) return "behind"
  return "on-time"
}

export type ScheduleBadge = { text: string; ariaLabel: string }

export function getScheduleBadge(deltaDays: number): ScheduleBadge {
  const status = getScheduleStatus(deltaDays)
  if (status === "ahead") {
    const days = Math.abs(deltaDays)
    return { text: `🟢 ${days}d early`, ariaLabel: `${days} days early` }
  }
  if (status === "on-time") {
    return { text: "🟡 on time", ariaLabel: "On time" }
  }
  return { text: `🔴 ${deltaDays}d late`, ariaLabel: `${deltaDays} days late` }
}

/** Chip for delta under forecast: text only (no date), variant for styling. */
export type DeltaChip = { text: string; ariaLabel: string; variant: "success" | "warning" | "danger" | "neutral" }

/**
 * Variant rules: ahead = green, behind <7 days = yellow, behind ≥7 days = red, on target = neutral.
 */
export function getDeltaChip(diffDays: number): DeltaChip {
  if (diffDays < 0) {
    const absDiff = Math.abs(diffDays)
    const day = absDiff === 1 ? "day" : "days"
    return { text: `${absDiff} ${day} early`, ariaLabel: `${absDiff} ${day} early`, variant: "success" }
  }
  if (diffDays > 0) {
    const day = diffDays === 1 ? "day" : "days"
    const variant = diffDays < 7 ? "warning" : "danger"
    return { text: `${diffDays} ${day} late`, ariaLabel: `${diffDays} ${day} late`, variant }
  }
  return { text: "On target", ariaLabel: "On target", variant: "neutral" }
}

export type TimelinePoint = { type: "start" | "target" | "forecast"; date: Date; position: number }

/**
 * Normalized timeline range and point positions (0–1) in chronological order.
 * start = min(dates), end = max(dates), position(d) = (d - start) / (end - start).
 */
export function getTimelinePositions(
  startDate: Date | null,
  targetDate: Date | null,
  forecastDate: Date | null
): {
  rangeStart: Date
  rangeEnd: Date
  points: TimelinePoint[]
  hasOverrun: boolean
  overrunStart: number
  overrunEnd: number
} {
  const start = startDate ? startOfDay(startDate) : null
  const target = targetDate ? startOfDay(targetDate) : null
  const forecast = forecastDate ? startOfDay(forecastDate) : null

  const defined = [start, target, forecast].filter((d): d is Date => d != null)
  if (defined.length === 0) {
    const fallback = new Date()
    return {
      rangeStart: fallback,
      rangeEnd: fallback,
      points: [],
      hasOverrun: false,
      overrunStart: 0,
      overrunEnd: 0,
    }
  }

  const rangeStart = new Date(Math.min(...defined.map((d) => d.getTime())))
  const rangeEnd = new Date(Math.max(...defined.map((d) => d.getTime())))
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime()
  const position = (d: Date) => (rangeMs === 0 ? 0.5 : (d.getTime() - rangeStart.getTime()) / rangeMs)

  const points: TimelinePoint[] = []
  if (start) points.push({ type: "start", date: start, position: position(start) })
  if (target) points.push({ type: "target", date: target, position: position(target) })
  if (forecast) points.push({ type: "forecast", date: forecast, position: position(forecast) })
  points.sort((a, b) => a.position - b.position)

  const hasOverrun = forecast != null && target != null && forecast.getTime() > target.getTime()
  const overrunStart = hasOverrun ? position(target!) : 0
  const overrunEnd = hasOverrun ? position(forecast!) : 0

  return { rangeStart, rangeEnd, points, hasOverrun, overrunStart, overrunEnd }
}
