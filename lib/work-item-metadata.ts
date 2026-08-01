/**
 * Pure helpers for Work Item card metadata display.
 * UI-only — no scheduling or business logic.
 */

export type WorkItemMetadataInput = {
  durationDays?: number | null
  contractorName?: string | null
  /** Confirmation SMS / call timestamp (“Called”). */
  calledAt?: string | Date | null
  scheduledDate?: string | Date | null
  startedAt?: string | Date | null
  completedAt?: string | Date | null
  punchOpenCount?: number | null
}

export type WorkItemMilestoneKey = "called" | "scheduled" | "started" | "completed"

export type WorkItemMilestone = {
  key: WorkItemMilestoneKey
  label: string
  date: Date | null
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/** Abbreviated duration: "2d", "1d". Returns null when missing/invalid. */
export function formatDurationShort(durationDays: number | null | undefined): string | null {
  if (durationDays == null || !Number.isFinite(durationDays) || durationDays < 0) return null
  const days = Math.round(durationDays)
  return `${days}d`
}

/** Screen-reader duration: "2 working days". */
export function formatDurationAria(durationDays: number | null | undefined): string | null {
  if (durationDays == null || !Number.isFinite(durationDays) || durationDays < 0) return null
  const days = Math.round(durationDays)
  return `${days} working day${days === 1 ? "" : "s"}`
}

/** Compact numeric date for narrow screens: "7/13". */
export function formatMilestoneDateCompact(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** Medium date without year: "Jul 13". */
export function formatMilestoneDateMedium(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function buildWorkItemMilestones(input: WorkItemMetadataInput): WorkItemMilestone[] {
  return [
    { key: "called", label: "Called", date: parseDate(input.calledAt) },
    { key: "scheduled", label: "Scheduled", date: parseDate(input.scheduledDate) },
    { key: "started", label: "Started", date: parseDate(input.startedAt) },
    { key: "completed", label: "Completed", date: parseDate(input.completedAt) },
  ]
}
