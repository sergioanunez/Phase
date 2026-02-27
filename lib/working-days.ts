import { addDays, differenceInCalendarDays } from "date-fns"

/** Returns true if the given date is a working day (Mon–Fri). */
export function isWorkingDay(date: Date): boolean {
  const day = date.getDay()
  return day !== 0 && day !== 6 // 0 = Sunday, 6 = Saturday
}

/**
 * Normalize a date to the nearest working day (Mon–Fri).
 * - If Saturday → following Monday
 * - If Sunday → following Monday
 * - Otherwise returns the same calendar day (time truncated to midnight).
 */
export function normalizeToWorkingDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  if (day === 6) {
    // Saturday → Monday
    return addDays(d, 2)
  }
  if (day === 0) {
    // Sunday → Monday
    return addDays(d, 1)
  }
  return d
}

/** Advance forward by n working days (Mon–Fri), starting from start (offset 0). */
export function addWorkingDays(start: Date, workingDays: number): Date {
  if (workingDays <= 0) return new Date(start)

  let daysAdded = 0
  let current = new Date(start)

  while (daysAdded < workingDays) {
    current = addDays(current, 1)
    if (isWorkingDay(current)) {
      daysAdded += 1
    }
  }

  return current
}

/** Count working days between start (exclusive) and end (inclusive) for offsets. */
export function workingDayDiff(start: Date, end: Date): number {
  if (end <= start) return 0

  let diff = 0
  let current = new Date(start)
  const totalDays = differenceInCalendarDays(end, start)

  for (let i = 0; i < totalDays; i++) {
    current = addDays(current, 1)
    if (isWorkingDay(current)) {
      diff += 1
    }
  }

  return diff
}

/** Go backward by n working days (Mon–Fri). */
export function subWorkingDays(start: Date, workingDays: number): Date {
  if (workingDays <= 0) return new Date(start)
  let remaining = workingDays
  let current = new Date(start)
  while (remaining > 0) {
    current = addDays(current, -1)
    if (isWorkingDay(current)) remaining -= 1
  }
  return current
}

/** Working days from a to b (b - a). Positive if b > a, negative if b < a. */
export function diffWorkingDays(a: Date, b: Date): number {
  if (b >= a) return workingDayDiff(a, b)
  return -workingDayDiff(b, a)
}

