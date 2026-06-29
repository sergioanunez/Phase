import { isTaskIncompleteForProgress } from "@/lib/task-status"

export type CatchUpScheduleTask = {
  id: string
  nameSnapshot: string
  status: string
  scheduledDate: Date | string | null
  sortOrderSnapshot: number
  isCriticalPath?: boolean
  templateItem?: {
    optionalCategory: string | null
    isCriticalGate?: boolean
  } | null
}

/** Tasks eligible for catch-up: incomplete, not N/A, not canceled. */
export function isCatchUpEligibleTask(status: string): boolean {
  return isTaskIncompleteForProgress(status)
}

/** Flat list in template order (caller should pass tasks already sorted). */
export function selectTaskIdsUpToAnchor(
  orderedEligibleIds: string[],
  anchorTaskId: string
): string[] {
  const idx = orderedEligibleIds.indexOf(anchorTaskId)
  if (idx === -1) return []
  return orderedEligibleIds.slice(0, idx + 1)
}

export function parseCatchUpCompletedDate(dateStr: string): Date {
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`)
  d.setHours(12, 0, 0, 0)
  return d
}

export function isCatchUpDateInFuture(date: Date, today = new Date()): boolean {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  return day.getTime() > t.getTime()
}
