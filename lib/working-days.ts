import { addDays, differenceInCalendarDays, isSaturday, isSunday } from "date-fns"

/** Returns true if the given date is a working day (Mon–Fri). */
export function isWorkingDay(date: Date): boolean {
  const day = date.getDay()
  return day !== 0 && day !== 6 // 0 = Sunday, 6 = Saturday
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

