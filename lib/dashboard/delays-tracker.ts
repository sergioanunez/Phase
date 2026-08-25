/**
 * Delays Tracker: contractor-confirmed tasks that should already be underway.
 * Qualification is derived from existing task state only (no separate delay flag).
 */

import { startOfDay } from "date-fns"
import { normalizeStoredScheduledDate } from "@/lib/calendar-date"
import { workingDaysBetween } from "@/lib/working-days"
import type { DashboardHouseRowData } from "@/lib/dashboard/drilldown"

export type DelayedTaskInput = {
  id: string
  status: string
  scheduledDate: Date | null
  confirmedAt: Date | null
  startedAt: Date | null
  name: string
  contractorId: string | null
  contractorName: string | null
  homeId: string
  address: string
  subdivisionName: string
  displayOrder: number
  companyId?: string | null
}

export type DelayedTaskRow = DashboardHouseRowData & {
  scheduledTaskDate: string | null
  confirmedAt: string | null
  contractorName: string | null
  daysDelayed: number
}

export type DelaysContractorGroup = {
  contractorId: string
  contractorName: string
  delayCount: number
  oldestDaysDelayed: number
  tasks: DelayedTaskRow[]
}

export type DelaysTrackerResult = {
  summary: {
    delayedTaskCount: number
    contractorCount: number
    homeCount: number
  }
  contractors: DelaysContractorGroup[]
}

/**
 * Authoritative contractor confirmation: status Confirmed only.
 * Declined = unresolved reschedule request → not a confirmed delay.
 * InProgress/Completed/N/A/Canceled/PendingConfirm/Scheduled → excluded.
 */
export function isConfirmedNotStartedDelayCandidate(task: {
  status: string
  startedAt?: Date | null
}): boolean {
  if (task.status !== "Confirmed") return false
  if (task.startedAt != null) return false
  return true
}

/**
 * True when the scheduled working day has fully passed under Phase’s Mon–Fri calendar.
 * Uses workingDaysBetween (start exclusive, end inclusive):
 * - scheduled today → 0 → not delayed (full day to start)
 * - scheduled Fri, viewed Sat/Sun → 0 → not delayed (weekend non-working)
 * - scheduled Fri, viewed Mon → 1 → delayed
 * - scheduled yesterday (working day) → ≥1 → delayed
 */
export function isPastScheduledWorkingDay(
  scheduledDate: Date | string | null | undefined,
  today: Date = new Date()
): boolean {
  if (scheduledDate == null) return false
  return computeWorkingDaysDelayed(scheduledDate, today) > 0
}

/**
 * Working-day delay: scheduled day → today using Phase workingDaysBetween
 * (start exclusive, end inclusive). Qualifying delays are always ≥ 1.
 */
export function computeWorkingDaysDelayed(
  scheduledDate: Date | string,
  today: Date = new Date()
): number {
  const scheduled = startOfDay(normalizeStoredScheduledDate(new Date(scheduledDate)))
  const day = startOfDay(today)
  if (Number.isNaN(scheduled.getTime())) return 0
  return workingDaysBetween(scheduled, day)
}

export function qualifiesAsDelayedTask(
  task: DelayedTaskInput,
  today: Date = new Date()
): boolean {
  if (!task.contractorId || !task.contractorName?.trim()) return false
  if (!isConfirmedNotStartedDelayCandidate(task)) return false
  if (task.scheduledDate == null) return false
  if (!isPastScheduledWorkingDay(task.scheduledDate, today)) return false
  return true
}

export function delaySeverity(daysDelayed: number): "amber" | "red" {
  return daysDelayed >= 3 ? "red" : "amber"
}

function toDelayedRow(task: DelayedTaskInput, today: Date): DelayedTaskRow {
  const daysDelayed = computeWorkingDaysDelayed(task.scheduledDate!, today)
  return {
    homeId: task.homeId,
    address: task.address,
    subdivisionName: task.subdivisionName,
    startDate: null,
    forecastDate: null,
    targetDate: null,
    daysBehind: daysDelayed,
    nextCriticalTaskId: task.id,
    nextCriticalTaskName: task.name,
    lastMilestoneTaskId: null,
    lastMilestoneName: null,
    lastMilestoneCompletedAt: null,
    displayOrder: task.displayOrder,
    scheduledTaskDate: task.scheduledDate
      ? startOfDay(normalizeStoredScheduledDate(new Date(task.scheduledDate))).toISOString()
      : null,
    confirmedAt: task.confirmedAt ? new Date(task.confirmedAt).toISOString() : null,
    contractorName: task.contractorName,
    daysDelayed,
  }
}

function sortDelayedTasks(a: DelayedTaskRow, b: DelayedTaskRow): number {
  if (a.daysDelayed !== b.daysDelayed) return b.daysDelayed - a.daysDelayed
  const as = a.scheduledTaskDate ? new Date(a.scheduledTaskDate).getTime() : 0
  const bs = b.scheduledTaskDate ? new Date(b.scheduledTaskDate).getTime() : 0
  if (as !== bs) return as - bs
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
  return a.address.localeCompare(b.address)
}

/**
 * Group qualifying delayed tasks by contractor.
 * Sort: highest delay count → oldest delay → name.
 */
export function buildDelaysTracker(
  tasks: DelayedTaskInput[],
  today: Date = new Date()
): DelaysTrackerResult {
  const byContractor = new Map<string, DelayedTaskRow[]>()
  const names = new Map<string, string>()

  for (const task of tasks) {
    if (!qualifiesAsDelayedTask(task, today)) continue
    const row = toDelayedRow(task, today)
    const list = byContractor.get(task.contractorId!) ?? []
    list.push(row)
    byContractor.set(task.contractorId!, list)
    names.set(task.contractorId!, task.contractorName!.trim())
  }

  const contractors: DelaysContractorGroup[] = []
  const homeIds = new Set<string>()
  let delayedTaskCount = 0

  for (const [contractorId, rows] of byContractor) {
    const tasksSorted = [...rows].sort(sortDelayedTasks)
    const oldestDaysDelayed = tasksSorted.reduce(
      (max, t) => Math.max(max, t.daysDelayed),
      0
    )
    for (const t of tasksSorted) homeIds.add(t.homeId)
    delayedTaskCount += tasksSorted.length
    contractors.push({
      contractorId,
      contractorName: names.get(contractorId) ?? "Contractor",
      delayCount: tasksSorted.length,
      oldestDaysDelayed,
      tasks: tasksSorted,
    })
  }

  contractors.sort((a, b) => {
    if (a.delayCount !== b.delayCount) return b.delayCount - a.delayCount
    if (a.oldestDaysDelayed !== b.oldestDaysDelayed) {
      return b.oldestDaysDelayed - a.oldestDaysDelayed
    }
    return a.contractorName.localeCompare(b.contractorName)
  })

  return {
    summary: {
      delayedTaskCount,
      contractorCount: contractors.length,
      homeCount: homeIds.size,
    },
    contractors,
  }
}
