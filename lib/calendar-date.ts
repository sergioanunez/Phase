import { format } from "date-fns"

/**
 * Parse yyyy-MM-dd from `<input type="date">` as a local calendar date (noon local).
 * Avoids UTC-midnight parsing that shifts the displayed day in US timezones.
 */
export function parseCalendarDateInput(dateStr: string): Date {
  const trimmed = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00`)
  }
  return normalizeStoredScheduledDate(new Date(trimmed))
}

/** Serialize a calendar date input to ISO for API storage. */
export function calendarDateInputToIso(dateStr: string): string {
  return parseCalendarDateInput(dateStr).toISOString()
}

/**
 * Legacy scheduled dates were often stored at UTC midnight, which renders as the
 * previous calendar day in US timezones. Normalize to UTC noon on the same date.
 */
export function normalizeStoredScheduledDate(date: Date): Date {
  if (Number.isNaN(date.getTime())) return date
  const iso = date.toISOString()
  if (/T00:00:00\.000Z$/.test(iso)) {
    return new Date(`${iso.slice(0, 10)}T12:00:00.000Z`)
  }
  return date
}

/** Format a stored scheduled date for `<input type="date">` (yyyy-MM-dd). */
export function formatScheduledDateInput(value: string | Date | null | undefined): string {
  if (!value) return ""
  const date =
    typeof value === "string" ? normalizeStoredScheduledDate(new Date(value)) : normalizeStoredScheduledDate(value)
  return format(date, "yyyy-MM-dd")
}
