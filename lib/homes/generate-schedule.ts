import { createHash } from "crypto"
import {
  buildTaskNodesFromPrismaTasks,
  computeHomeForecast,
  normalizeToWorkingDay,
  taskFinishFromDuration,
  workingDaysBetween,
} from "@/lib/forecast"
import { isTaskIncompleteForProgress } from "@/lib/task-status"

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
  /** Assigned trade for HomeTask; used by contractor-scoped generation. */
  contractorId: string | null
  templateItem: {
    optionalCategory: string | null
    isCriticalGate: boolean
  } | null
  contractor: { companyName: string } | null
}

/** Category and contractor are alternative scopes for this milestone (not combined). */
export type ScheduleGenerationScope = {
  category?: string | null
  contractorId?: string | null
}

export type ScheduleProposalRow = {
  taskId: string
  taskName: string
  category: string | null
  contractorName: string | null
  status: string
  currentScheduledDate: string | null
  /** Null when blocked and no safe date can be proposed. */
  proposedStart: string | null
  proposedFinish: string | null
  durationDays: number
  isCritical: boolean
  blocked?: boolean
  blockedReason?: string | null
  preservedExisting?: boolean
}

export type GenerateSchedulePreview = {
  mode: GenerateScheduleMode
  modeLabel: string
  respectExistingScheduledDates: boolean
  scheduleBehaviorLabel: string
  /** Tenant category name (optionalCategory), or null when not category-scoped. */
  category: string | null
  categoryLabel: string
  /** Selected contractor/trade id, or null when not contractor-scoped. */
  contractorId: string | null
  /** Display name for contractor scope (preview / print). */
  contractorLabel: string | null
  /** Human label for the active work scope (all / category / contractor). */
  workScopeLabel: string
  anchorDate: string
  proposedCount: number
  blockedCount: number
  completedSkipped: number
  proposedFirstDate: string | null
  proposedCompletionDate: string | null
  totalWorkingDays: number
  rows: ScheduleProposalRow[]
  warnings: string[]
  error?: string
  hasCycle: boolean
  /** Fingerprint of source task state for stale-preview detection on apply. */
  sourceFingerprint: string
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
  return isTaskIncompleteForProgress(task.status)
}

export function taskMatchesCategory(
  task: ScheduleTaskInput,
  category: string | null | undefined
): boolean {
  if (!category) return true
  return (task.templateItem?.optionalCategory ?? "") === category
}

export function taskMatchesContractor(
  task: ScheduleTaskInput,
  contractorId: string | null | undefined
): boolean {
  if (!contractorId) return true
  return task.contractorId === contractorId
}

export function taskMatchesGenerationScope(
  task: ScheduleTaskInput,
  scope: ScheduleGenerationScope
): boolean {
  return (
    taskMatchesCategory(task, scope.category) &&
    taskMatchesContractor(task, scope.contractorId)
  )
}

export function hasNarrowScheduleScope(scope: ScheduleGenerationScope): boolean {
  return Boolean(scope.category) || Boolean(scope.contractorId)
}

/** Stable fingerprint of task schedule state for stale-preview checks. */
export function computeTasksFingerprint(tasks: ScheduleTaskInput[]): string {
  const parts = [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (t) =>
        `${t.id}:${t.status}:${t.scheduledDate ? new Date(t.scheduledDate).toISOString() : ""}`
    )
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32)
}

/**
 * Direct incomplete predecessor outside the selected scope with no scheduled date.
 * Scoped generation must not invent dates that ignore this blocker.
 * Does not schedule or mutate the external predecessor.
 */
export function findUnscheduledExternalPredecessor(
  task: ScheduleTaskInput,
  tasksByTemplateItemId: Map<string, ScheduleTaskInput>,
  templateDeps: Array<{ templateItemId: string; dependsOnItemId: string }>,
  scope: ScheduleGenerationScope | string
): ScheduleTaskInput | null {
  const normalized: ScheduleGenerationScope =
    typeof scope === "string" ? { category: scope } : scope
  if (!hasNarrowScheduleScope(normalized)) return null

  const deps = templateDeps.filter((d) => d.templateItemId === task.templateItemId)
  for (const dep of deps) {
    const pred = tasksByTemplateItemId.get(dep.dependsOnItemId)
    if (!pred) continue
    if (!isScheduleTaskEligible(pred)) continue
    if (taskMatchesGenerationScope(pred, normalized)) continue
    if (pred.scheduledDate == null) return pred
  }
  return null
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
  respectExistingScheduledDates?: boolean
  /** When set, only propose dates for this optionalCategory; never alter other categories. */
  category?: string | null
  /** When set, only propose dates for this contractor; never alter other trades. */
  contractorId?: string | null
  /** Display name when contractorId is set (preview / export labels). */
  contractorName?: string | null
}): GenerateSchedulePreview {
  const {
    home,
    tasks,
    templateDeps,
    anchorDate,
    mode,
    respectExistingScheduledDates = true,
    category: categoryParam = null,
    contractorId: contractorIdParam = null,
    contractorName = null,
  } = params

  // Milestone: category and contractor are alternative scopes (not combined).
  const contractorId = contractorIdParam || null
  const category = contractorId ? null : categoryParam || null
  const scope: ScheduleGenerationScope = { category, contractorId }

  const anchor = normalizeToWorkingDay(startOfDay(anchorDate))
  const modeLabel = mode === "critical" ? "Critical tasks only" : "All remaining tasks"
  const contractorLabel = contractorId
    ? contractorName?.trim() ||
      tasks.find((t) => t.contractorId === contractorId)?.contractor?.companyName ||
      "Selected contractor"
    : null
  const categoryLabel = category ? category : "All categories"
  const workScopeLabel = contractorLabel
    ? contractorLabel
    : category
      ? category
      : "All work"
  const scheduleBehaviorLabel = respectExistingScheduledDates
    ? "Respect existing scheduled dates"
    : "Recalculate all eligible tasks"
  const completedSkipped = tasks.filter(isScheduleTaskCompleted).length
  const sourceFingerprint = computeTasksFingerprint(tasks)

  const emptyPreview = (partial: Partial<GenerateSchedulePreview>): GenerateSchedulePreview => ({
    mode,
    modeLabel,
    respectExistingScheduledDates,
    scheduleBehaviorLabel,
    category,
    categoryLabel,
    contractorId,
    contractorLabel,
    workScopeLabel,
    anchorDate: toDateOnlyISO(anchor),
    proposedCount: 0,
    blockedCount: 0,
    completedSkipped,
    proposedFirstDate: null,
    proposedCompletionDate: null,
    totalWorkingDays: 0,
    rows: [],
    warnings: [],
    hasCycle: false,
    sourceFingerprint,
    ...partial,
  })

  const eligible = tasks.filter(isScheduleTaskEligible)
  if (eligible.length === 0) {
    return emptyPreview({ error: "No remaining tasks to schedule." })
  }

  const eligibleInScope = eligible.filter((t) => taskMatchesGenerationScope(t, scope))
  if (hasNarrowScheduleScope(scope) && eligibleInScope.length === 0) {
    return emptyPreview({
      error: contractorId
        ? `No applicable tasks for ${workScopeLabel}.`
        : `No applicable tasks in category “${category}”.`,
      warnings: [
        contractorId
          ? `House has no remaining work items assigned to ${workScopeLabel}.`
          : `House has no remaining work items in ${category}.`,
      ],
    })
  }

  // Respect OFF only clears dates inside the selected generation scope.
  const nodes = buildTaskNodesFromPrismaTasks(
    tasks.map((t) => {
      const inScope = isScheduleTaskEligible(t) && taskMatchesGenerationScope(t, scope)
      let scheduledDate = t.scheduledDate
      if (inScope) {
        if (respectExistingScheduledDates && t.scheduledDate) {
          scheduledDate = t.scheduledDate
        } else {
          scheduledDate = null
        }
      }
      return {
        id: t.id,
        templateItemId: t.templateItemId,
        nameSnapshot: t.nameSnapshot,
        durationDaysSnapshot: t.durationDaysSnapshot,
        status: t.status,
        scheduledDate,
        completedAt: t.completedAt,
      }
    }),
    templateDeps
  )

  const cpm = computeHomeForecast(nodes, anchor)
  const hasCycle = cpm.warnings.some((w) => /cycle/i.test(w))
  if (hasCycle) {
    return emptyPreview({
      warnings: cpm.warnings,
      error:
        "Dependency cycle detected. Fix template dependencies or try All remaining tasks / schedule manually.",
      hasCycle: true,
    })
  }

  const criticalIds = resolveCriticalTaskIds(tasks, cpm.criticalPathTaskIds)
  let targetTasks =
    mode === "critical" ? eligible.filter((t) => criticalIds.has(t.id)) : eligible
  targetTasks = targetTasks.filter((t) => taskMatchesGenerationScope(t, scope))

  if (mode === "critical" && targetTasks.length === 0) {
    return emptyPreview({
      warnings: cpm.warnings,
      error: contractorId
        ? `No remaining critical tasks for ${workScopeLabel}. Try All remaining tasks.`
        : category
          ? `No remaining critical tasks in “${category}”. Try All remaining tasks.`
          : "No remaining critical tasks found. Try All remaining tasks.",
    })
  }

  const tasksByTemplateItemId = new Map(tasks.map((t) => [t.templateItemId, t]))
  const warnings = [...cpm.warnings]

  const rows: ScheduleProposalRow[] = targetTasks
    .map((task) => {
      const durationDays = Math.max(0, task.durationDaysSnapshot)
      const hasExistingSchedule =
        respectExistingScheduledDates && task.scheduledDate != null

      if (hasNarrowScheduleScope(scope)) {
        const blocker = findUnscheduledExternalPredecessor(
          task,
          tasksByTemplateItemId,
          templateDeps,
          scope
        )
        if (blocker && !hasExistingSchedule) {
          return {
            taskId: task.id,
            taskName: task.nameSnapshot,
            category: task.templateItem?.optionalCategory ?? null,
            contractorName: task.contractor?.companyName ?? null,
            status: task.status,
            currentScheduledDate: task.scheduledDate
              ? toDateOnlyISO(new Date(task.scheduledDate))
              : null,
            proposedStart: null,
            proposedFinish: null,
            durationDays,
            isCritical: criticalIds.has(task.id),
            blocked: true,
            blockedReason: `Blocked by unscheduled dependency: ${blocker.nameSnapshot}`,
            preservedExisting: false,
          } satisfies ScheduleProposalRow
        }
      }

      let proposedStart: Date | undefined
      let proposedFinish: Date | undefined

      if (hasExistingSchedule) {
        proposedStart = normalizeToWorkingDay(startOfDay(new Date(task.scheduledDate!)))
        proposedFinish = taskFinishFromDuration(proposedStart, durationDays)
      } else {
        proposedStart = cpm.taskEarlyStart?.[task.id]
        proposedFinish = cpm.taskEarlyFinish?.[task.id]
      }

      if (!proposedStart || !proposedFinish) {
        return {
          taskId: task.id,
          taskName: task.nameSnapshot,
          category: task.templateItem?.optionalCategory ?? null,
          contractorName: task.contractor?.companyName ?? null,
          status: task.status,
          currentScheduledDate: task.scheduledDate
            ? toDateOnlyISO(new Date(task.scheduledDate))
            : null,
          proposedStart: null,
          proposedFinish: null,
          durationDays,
          isCritical: criticalIds.has(task.id),
          blocked: true,
          blockedReason: "Impossible calculation — missing dependency dates",
          preservedExisting: false,
        } satisfies ScheduleProposalRow
      }

      return {
        taskId: task.id,
        taskName: task.nameSnapshot,
        category: task.templateItem?.optionalCategory ?? null,
        contractorName: task.contractor?.companyName ?? null,
        status: task.status,
        currentScheduledDate: task.scheduledDate
          ? toDateOnlyISO(new Date(task.scheduledDate))
          : null,
        proposedStart: toDateOnlyISO(proposedStart),
        proposedFinish: toDateOnlyISO(proposedFinish),
        durationDays,
        isCritical: criticalIds.has(task.id),
        blocked: false,
        blockedReason: null,
        preservedExisting: hasExistingSchedule,
      } satisfies ScheduleProposalRow
    })
    .sort((a, b) => {
      const as = a.proposedStart ?? "9999"
      const bs = b.proposedStart ?? "9999"
      return as.localeCompare(bs)
    })

  const blockedCount = rows.filter((r) => r.blocked).length
  const datedRows = rows.filter((r) => r.proposedStart && !r.blocked)
  if (blockedCount > 0) {
    warnings.push(
      `${blockedCount} task${blockedCount === 1 ? "" : "s"} blocked by unscheduled dependency or missing dates.`
    )
  }

  const proposedStarts = datedRows.map((r) => new Date(r.proposedStart!))
  const proposedFirstDate =
    proposedStarts.length > 0
      ? toDateOnlyISO(
          proposedStarts.reduce((min, d) => (d < min ? d : min), proposedStarts[0]!)
        )
      : null

  const finishDates = datedRows
    .map((r) => (r.proposedFinish ? new Date(r.proposedFinish) : null))
    .filter((d): d is Date => d != null)
  const proposedCompletionDate =
    finishDates.length > 0
      ? toDateOnlyISO(finishDates.reduce((max, d) => (d > max ? d : max), finishDates[0]!))
      : null

  const totalWorkingDays =
    proposedFirstDate && proposedCompletionDate
      ? workingDaysBetween(new Date(proposedFirstDate), new Date(proposedCompletionDate))
      : 0

  return {
    mode,
    modeLabel,
    respectExistingScheduledDates,
    scheduleBehaviorLabel,
    category,
    categoryLabel,
    contractorId,
    contractorLabel,
    workScopeLabel,
    anchorDate: toDateOnlyISO(anchor),
    proposedCount: datedRows.length,
    blockedCount,
    completedSkipped,
    proposedFirstDate,
    proposedCompletionDate,
    totalWorkingDays,
    rows,
    warnings,
    hasCycle: false,
    sourceFingerprint,
  }
}

export function proposalsToScheduledDates(
  preview: GenerateSchedulePreview
): Array<{ taskId: string; scheduledDate: Date }> {
  return preview.rows
    .filter((row) => {
      if (row.blocked || !row.proposedStart) return false
      if (!preview.respectExistingScheduledDates) return true
      return row.currentScheduledDate == null
    })
    .map((row) => ({
      taskId: row.taskId,
      scheduledDate: startOfDay(new Date(row.proposedStart!)),
    }))
}
