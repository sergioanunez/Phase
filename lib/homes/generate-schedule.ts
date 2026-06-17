import {
  addWorkingDays,
  buildTaskNodesFromPrismaTasks,
  computeHomeForecast,
  normalizeToWorkingDay,
  workingDaysBetween,
} from "@/lib/forecast"

export type GenerateScheduleMode = "critical" | "all"

export type ScheduleTaskInput = {
  id: string
  templateItemId: string
  nameSnapshot: string
  durationDaysSnapshot: number
  status: string
  scheduledDate: Date | null
  completedAt: Date | null
  isCriticalPath: boolean
  templateItem: {
    optionalCategory: string | null
    isCriticalGate: boolean
  } | null
  contractor: { companyName: string } | null
}

export type ScheduleProposalRow = {
  taskId: string
  taskName: string
  category: string | null
  contractorName: string | null
  status: string
  currentScheduledDate: string | null
  proposedStart: string
  proposedFinish: string
  durationDays: number
  isCritical: boolean
}

export type GenerateSchedulePreview = {
  mode: GenerateScheduleMode
  modeLabel: string
  anchorDate: string
  proposedCount: number
  completedSkipped: number
  proposedFirstDate: string | null
  proposedCompletionDate: string | null
  totalWorkingDays: number
  rows: ScheduleProposalRow[]
  warnings: string[]
  error?: string
  hasCycle: boolean
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function toDateOnlyISO(d: Date): string {
  return startOfDay(d).toISOString()
}

export function isScheduleTaskCompleted(task: Pick<ScheduleTaskInput, "status">): boolean {
  return task.status === "Completed"
}

export function isScheduleTaskEligible(task: Pick<ScheduleTaskInput, "status">): boolean {
  return task.status !== "Completed" && task.status !== "Canceled"
}

/**
 * Default anchor: house start if no completions; else max(today, latest completedAt).
 */
export function computeDefaultAnchorDate(
  home: { startDate: Date | null },
  tasks: ScheduleTaskInput[]
): Date {
  const today = normalizeToWorkingDay(startOfDay(new Date()))
  const completedDates = tasks
    .filter(isScheduleTaskCompleted)
    .map((t) => t.completedAt)
    .filter((d): d is Date => d != null)
    .map((d) => normalizeToWorkingDay(startOfDay(new Date(d))))

  if (completedDates.length === 0) {
    if (home.startDate) {
      return normalizeToWorkingDay(startOfDay(new Date(home.startDate)))
    }
    return today
  }

  const latestCompleted = completedDates.reduce((max, d) => (d > max ? d : max), completedDates[0]!)
  return latestCompleted > today ? latestCompleted : today
}

export function resolveCriticalTaskIds(
  tasks: ScheduleTaskInput[],
  criticalPathTaskIds: string[]
): Set<string> {
  const critical = new Set<string>()
  for (const task of tasks) {
    if (!isScheduleTaskEligible(task)) continue
    if (task.templateItem?.isCriticalGate) critical.add(task.id)
    if (task.isCriticalPath) critical.add(task.id)
  }
  for (const id of criticalPathTaskIds) {
    if (tasks.some((t) => t.id === id && isScheduleTaskEligible(t))) {
      critical.add(id)
    }
  }
  return critical
}

export function buildSchedulePreview(params: {
  home: { startDate: Date | null }
  tasks: ScheduleTaskInput[]
  templateDeps: Array<{ templateItemId: string; dependsOnItemId: string }>
  anchorDate: Date
  mode: GenerateScheduleMode
}): GenerateSchedulePreview {
  const { home, tasks, templateDeps, anchorDate, mode } = params
  const anchor = normalizeToWorkingDay(startOfDay(anchorDate))
  const modeLabel = mode === "critical" ? "Critical tasks only" : "All remaining tasks"
  const completedSkipped = tasks.filter(isScheduleTaskCompleted).length

  const eligible = tasks.filter(isScheduleTaskEligible)
  if (eligible.length === 0) {
    return {
      mode,
      modeLabel,
      anchorDate: toDateOnlyISO(anchor),
      proposedCount: 0,
      completedSkipped,
      proposedFirstDate: null,
      proposedCompletionDate: null,
      totalWorkingDays: 0,
      rows: [],
      warnings: [],
      error: "No remaining tasks to schedule.",
      hasCycle: false,
    }
  }

  const nodes = buildTaskNodesFromPrismaTasks(
    tasks.map((t) => ({
      id: t.id,
      templateItemId: t.templateItemId,
      nameSnapshot: t.nameSnapshot,
      durationDaysSnapshot: t.durationDaysSnapshot,
      status: t.status,
      scheduledDate: isScheduleTaskEligible(t) ? null : t.scheduledDate,
      completedAt: t.completedAt,
    })),
    templateDeps
  )

  const cpm = computeHomeForecast(nodes, anchor)
  const hasCycle = cpm.warnings.some((w) => /cycle/i.test(w))
  if (hasCycle) {
    return {
      mode,
      modeLabel,
      anchorDate: toDateOnlyISO(anchor),
      proposedCount: 0,
      completedSkipped,
      proposedFirstDate: null,
      proposedCompletionDate: null,
      totalWorkingDays: 0,
      rows: [],
      warnings: cpm.warnings,
      error:
        "Dependency cycle detected. Fix template dependencies or try All remaining tasks / schedule manually.",
      hasCycle: true,
    }
  }

  const criticalIds = resolveCriticalTaskIds(tasks, cpm.criticalPathTaskIds)
  const targetTasks =
    mode === "critical" ? eligible.filter((t) => criticalIds.has(t.id)) : eligible

  if (mode === "critical" && targetTasks.length === 0) {
    return {
      mode,
      modeLabel,
      anchorDate: toDateOnlyISO(anchor),
      proposedCount: 0,
      completedSkipped,
      proposedFirstDate: null,
      proposedCompletionDate: null,
      totalWorkingDays: 0,
      rows: [],
      warnings: cpm.warnings,
      error: "No remaining critical tasks found. Try All remaining tasks.",
      hasCycle: false,
    }
  }

  const rows: ScheduleProposalRow[] = targetTasks
    .map((task) => {
      const proposedStart = cpm.taskEarlyStart?.[task.id]
      const proposedFinish = cpm.taskEarlyFinish?.[task.id]
      if (!proposedStart || !proposedFinish) return null
      const durationDays = Math.max(0, task.durationDaysSnapshot)
      return {
        taskId: task.id,
        taskName: task.nameSnapshot,
        category: task.templateItem?.optionalCategory ?? null,
        contractorName: task.contractor?.companyName ?? null,
        status: task.status,
        currentScheduledDate: task.scheduledDate ? toDateOnlyISO(new Date(task.scheduledDate)) : null,
        proposedStart: toDateOnlyISO(proposedStart),
        proposedFinish: toDateOnlyISO(proposedFinish),
        durationDays,
        isCritical: criticalIds.has(task.id),
      }
    })
    .filter((r): r is ScheduleProposalRow => r != null)
    .sort((a, b) => a.proposedStart.localeCompare(b.proposedStart))

  const proposedStarts = rows.map((r) => new Date(r.proposedStart))
  const proposedFirstDate =
    proposedStarts.length > 0
      ? toDateOnlyISO(
          proposedStarts.reduce((min, d) => (d < min ? d : min), proposedStarts[0]!)
        )
      : null

  const proposedCompletionDate =
    rows.length > 0 && cpm.forecastDate ? toDateOnlyISO(cpm.forecastDate) : null

  const totalWorkingDays =
    proposedFirstDate && proposedCompletionDate
      ? workingDaysBetween(new Date(proposedFirstDate), new Date(proposedCompletionDate))
      : 0

  return {
    mode,
    modeLabel,
    anchorDate: toDateOnlyISO(anchor),
    proposedCount: rows.length,
    completedSkipped,
    proposedFirstDate,
    proposedCompletionDate,
    totalWorkingDays,
    rows,
    warnings: cpm.warnings,
    hasCycle: false,
  }
}

export function proposalsToScheduledDates(
  preview: GenerateSchedulePreview
): Array<{ taskId: string; scheduledDate: Date }> {
  return preview.rows.map((row) => ({
    taskId: row.taskId,
    scheduledDate: startOfDay(new Date(row.proposedStart)),
  }))
}
