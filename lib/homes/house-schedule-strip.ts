import { addDays, format, isSameDay, startOfDay } from "date-fns"
import { isWorkingDay } from "@/lib/working-days"
import { isExcludedFromActiveWork } from "@/lib/task-status"

export type HouseScheduleTaskInput = {
  id: string
  nameSnapshot: string
  status: string
  scheduledDate: string | null
  completedAt: string | null
  confirmationSource?: "Manual" | "Sms" | null
  contractor?: { companyName: string } | null
  /** Optional — used by WorkItemMetadata when present. */
  durationDaysSnapshot?: number | null
  lastConfirmationAt?: string | null
  startedAt?: string | null
  punchOpenCount?: number | null
  hasOpenPunch?: boolean
}

export type HouseScheduleDayCell = {
  date: Date
  dateKey: string
  dayLabel: string
  dateNumber: string
  isWeekend: boolean
  isToday: boolean
  isWorkingDay: boolean
  tasks: HouseScheduleTaskInput[]
  scheduledCount: number
  hasOverdue: boolean
  allCompleted: boolean
  isGapDay: boolean
  gapLabel: string | null
}

export type HouseScheduleStrip = {
  days: HouseScheduleDayCell[]
  hasAnyScheduled: boolean
}

const TERMINAL_STATUSES = new Set(["Completed", "Canceled", "NotApplicable"])

function parseScheduledDay(iso: string | null): Date | null {
  if (!iso) return null
  return startOfDay(new Date(iso))
}

function isOverdueTask(task: HouseScheduleTaskInput, today: Date): boolean {
  if (TERMINAL_STATUSES.has(task.status)) return false
  const day = parseScheduledDay(task.scheduledDate)
  return day != null && day < today
}

function confirmationLabel(task: HouseScheduleTaskInput): string | null {
  if (task.status === "Confirmed") {
    return task.confirmationSource === "Sms" ? "Confirmed (SMS)" : "Confirmed"
  }
  if (task.status === "PendingConfirm") return "Awaiting confirmation"
  if (task.status === "Declined") return "Declined"
  return null
}

export function getHouseScheduleConfirmationLabel(task: HouseScheduleTaskInput): string | null {
  return confirmationLabel(task)
}

export function buildHouseScheduleStrip(
  tasks: HouseScheduleTaskInput[],
  options: { weekCount: 2 | 4; today?: Date }
): HouseScheduleStrip {
  const today = startOfDay(options.today ?? new Date())
  const totalDays = options.weekCount === 2 ? 14 : 28

  const scheduledTasks = tasks.filter((t) => t.scheduledDate != null)
  const hasAnyScheduled = scheduledTasks.length > 0

  const tasksByDay = new Map<string, HouseScheduleTaskInput[]>()
  for (const task of scheduledTasks) {
    const day = parseScheduledDay(task.scheduledDate)
    if (!day) continue
    const key = format(day, "yyyy-MM-dd")
    const list = tasksByDay.get(key) ?? []
    list.push(task)
    tasksByDay.set(key, list)
  }

  const days: HouseScheduleDayCell[] = []
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(today, i)
    const dateKey = format(date, "yyyy-MM-dd")
    const weekend = !isWorkingDay(date)
    const dayTasks = tasksByDay.get(dateKey) ?? []
    const activeTasks = dayTasks.filter((t) => !isExcludedFromActiveWork(t.status))
    const scheduledCount = activeTasks.length
    const hasOverdue = activeTasks.some((t) => isOverdueTask(t, today))
    const allCompleted =
      scheduledCount > 0 && activeTasks.every((t) => t.status === "Completed")

    days.push({
      date,
      dateKey,
      dayLabel: format(date, "EEE"),
      dateNumber: format(date, "d"),
      isWeekend: weekend,
      isToday: isSameDay(date, today),
      isWorkingDay: isWorkingDay(date),
      tasks: dayTasks,
      scheduledCount,
      hasOverdue,
      allCompleted,
      isGapDay: false,
      gapLabel: null,
    })
  }

  applyGapMarkers(days)

  return { days, hasAnyScheduled }
}

/**
 * Flags working days with 2+ consecutive empty days between days that have scheduled work.
 * Weekends are not counted as gap days.
 */
export function applyGapMarkers(days: HouseScheduleDayCell[]): void {
  const scheduledIndices = days
    .map((d, i) => (d.scheduledCount > 0 ? i : -1))
    .filter((i) => i >= 0)

  if (scheduledIndices.length < 2) return

  for (let s = 0; s < scheduledIndices.length - 1; s++) {
    const from = scheduledIndices[s]!
    const to = scheduledIndices[s + 1]!
    const gapIndices: number[] = []

    for (let i = from + 1; i < to; i++) {
      const cell = days[i]!
      if (!cell.isWorkingDay) continue
      if (cell.scheduledCount === 0) {
        gapIndices.push(i)
      }
    }

    if (gapIndices.length >= 2) {
      const label = `${gapIndices.length}-day gap`
      for (let g = 0; g < gapIndices.length; g++) {
        const idx = gapIndices[g]!
        days[idx]!.isGapDay = true
        if (g === 0) days[idx]!.gapLabel = label
      }
    }
  }
}
