/**
 * Calendar export date-range helpers (read-only reporting).
 * Uses calendar days — not working-day schedule logic.
 */

import { addDays, format, parseISO, startOfDay } from "date-fns"

export type CalendarExportRangePreset = "30" | "60" | "90" | "custom"

export type CalendarExportDateRange = {
  start: Date
  end: Date
  /** Inclusive calendar-day count (approx for presets). */
  labelDays: number | null
  preset: CalendarExportRangePreset
}

export function resolveCalendarExportRange(params: {
  preset: CalendarExportRangePreset
  /** yyyy-MM-dd when preset is custom */
  customStart?: string
  customEnd?: string
  /** Anchor “today”; defaults to local start of today. */
  today?: Date
}): CalendarExportDateRange | { error: string } {
  const today = startOfDay(params.today ?? new Date())

  if (params.preset === "custom") {
    const startRaw = params.customStart?.trim() ?? ""
    const endRaw = params.customEnd?.trim() ?? ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
      return { error: "Enter a valid start and end date." }
    }
    const start = startOfDay(parseISO(startRaw))
    const end = startOfDay(parseISO(endRaw))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { error: "Enter a valid start and end date." }
    }
    if (end < start) {
      return { error: "End date must be on or after start date." }
    }
    return { start, end, labelDays: null, preset: "custom" }
  }

  const days = params.preset === "30" ? 30 : params.preset === "60" ? 60 : 90
  // Inclusive window: today through today + (N - 1) calendar days.
  const start = today
  const end = addDays(today, days - 1)
  return { start, end, labelDays: days, preset: params.preset }
}

export function formatExportRangeLabel(start: Date, end: Date): string {
  return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`
}

export function productionScheduleTitle(
  preset: CalendarExportRangePreset,
  labelDays: number | null
): string {
  if (preset === "custom" || labelDays == null) {
    return "Production Schedule"
  }
  return `${labelDays}-Day Production Schedule`
}

export function toExportQueryDate(d: Date): string {
  return format(d, "yyyy-MM-dd")
}
