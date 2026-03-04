import { differenceInDays, startOfDay } from "date-fns"

/**
 * Delta in days: forecast − target.
 * Negative = ahead, zero = on time, positive = behind.
 */
export function getDeltaDays(forecastDate: Date, targetDate: Date): number {
  const forecast = startOfDay(forecastDate)
  const target = startOfDay(targetDate)
  return differenceInDays(forecast, target)
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
