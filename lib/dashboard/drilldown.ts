/**
 * In-place Dashboard drill-down: grouping, sorting, and compact house rows.
 * Reuses getScheduleStatus, computeCurrentPhaseForHome, and Field Pulse milestone selection.
 * Does not change those calculations.
 */

import { differenceInCalendarDays, startOfDay } from "date-fns"
import { getScheduleStatus, type ScheduleStatus } from "@/lib/schedule-status"
import { isTaskIncompleteForProgress } from "@/lib/task-status"
import {
  computeCurrentPhaseForHome,
  deriveOrderedCategories,
  type DashboardHomeForPhase,
} from "@/lib/dashboard/phaseDistribution"
import {
  isPulseMilestoneTask,
  type DashboardTaskForPulse,
} from "@/lib/dashboard/pulse"
import { compareWorkTemplatesForDisplay } from "@/lib/work-template-display-order"

export const DASHBOARD_DRILLDOWN_SEARCH_MIN = 10

export type DashboardDrilldownKind = "portfolio" | "timeline" | "pulse" | "delays"

export type DashboardDrilldownContext =
  | { kind: "portfolio"; status: ScheduleStatus; title: string }
  | { kind: "timeline"; phaseKey: string; title: string }
  | { kind: "pulse"; subdivisionId: string; title: string }
  | { kind: "delays"; contractorId: string; title: string }

export type DashboardHouseRowData = {
  homeId: string
  address: string
  subdivisionName: string
  startDate: string | null
  forecastDate: string | null
  targetDate: string | null
  daysBehind: number | null
  nextCriticalTaskId: string | null
  nextCriticalTaskName: string | null
  lastMilestoneTaskId: string | null
  lastMilestoneName: string | null
  lastMilestoneCompletedAt: string | null
  status?: ScheduleStatus
  displayOrder: number
  /** Delays Tracker: scheduled date of the delayed confirmed task. */
  scheduledTaskDate?: string | null
  /** Delays Tracker: contractor confirmation timestamp. */
  confirmedAt?: string | null
  contractorName?: string | null
  daysDelayed?: number
}

export type DrilldownTaskInput = {
  id: string
  status: string
  scheduledDate: Date | null
  completedAt: Date | null
  updatedAt?: Date
  isCriticalPath: boolean
  durationDaysSnapshot: number
  name: string
  optionalCategory: string | null
  sortOrder: number
  sequenceOrder: number | null
  isCriticalGate: boolean
}

export type DrilldownHomeInput = {
  id: string
  addressOrLot: string
  startDate: Date | null
  createdAt: Date
  displayOrder: number
  isComplete: boolean
  forecastCompletionDate: Date | null
  targetCompletionDate: Date | null
  subdivision: { id: string; name: string }
  tasks: DrilldownTaskInput[]
}

export const PORTFOLIO_STATUS_TITLES: Record<
  Exclude<ScheduleStatus, "completed">,
  string
> = {
  not_started: "Not Started",
  on_track: "On Track",
  at_risk: "At Risk",
  behind: "Behind",
}

export function canOpenDrilldown(count: number): boolean {
  return count > 0
}

export function daysBehindForecast(
  forecastCompletionDate: Date | string | null | undefined,
  targetCompletionDate: Date | string | null | undefined
): number | null {
  if (!forecastCompletionDate || !targetCompletionDate) return null
  const forecast = startOfDay(new Date(forecastCompletionDate))
  const target = startOfDay(new Date(targetCompletionDate))
  if (Number.isNaN(forecast.getTime()) || Number.isNaN(target.getTime())) return null
  const days = differenceInCalendarDays(forecast, target)
  return days > 0 ? days : null
}

export function houseDetailsHref(homeId: string, taskId?: string | null): string {
  if (taskId) return `/homes/${homeId}?task=${encodeURIComponent(taskId)}&highlight=1`
  return `/homes/${homeId}`
}

export function serializeInspectParam(ctx: DashboardDrilldownContext): string {
  if (ctx.kind === "portfolio") return `status:${ctx.status}`
  if (ctx.kind === "timeline") return `phase:${ctx.phaseKey}`
  if (ctx.kind === "delays") return `delays:${ctx.contractorId}`
  return `pulse:${ctx.subdivisionId}`
}

export function parseInspectParam(
  raw: string | null | undefined
): { kind: DashboardDrilldownKind; key: string } | null {
  if (!raw) return null
  const value = raw.trim()
  if (value.startsWith("status:")) {
    const status = value.slice("status:".length)
    if (
      status === "not_started" ||
      status === "on_track" ||
      status === "at_risk" ||
      status === "behind"
    ) {
      return { kind: "portfolio", key: status }
    }
    return null
  }
  if (value.startsWith("phase:")) {
    return { kind: "timeline", key: value.slice("phase:".length) }
  }
  if (value.startsWith("delays:")) {
    return { kind: "delays", key: value.slice("delays:".length) }
  }
  if (value.startsWith("pulse:")) {
    return { kind: "pulse", key: value.slice("pulse:".length) }
  }
  return null
}

function toPulseTask(t: DrilldownTaskInput): DashboardTaskForPulse {
  return {
    id: t.id,
    status: t.status,
    scheduledDate: t.scheduledDate,
    completedAt: t.completedAt,
    updatedAt: t.updatedAt ?? t.completedAt ?? new Date(0),
    isCriticalPath: t.isCriticalPath,
    durationDaysSnapshot: t.durationDaysSnapshot,
    templateItem: { name: t.name, isCriticalGate: t.isCriticalGate },
  }
}

function compareTaskDisplayOrder(a: DrilldownTaskInput, b: DrilldownTaskInput): number {
  return compareWorkTemplatesForDisplay(
    {
      sequenceOrder: a.sequenceOrder,
      optionalCategory: a.optionalCategory,
      sortOrder: a.sortOrder,
      name: a.name,
    },
    {
      sequenceOrder: b.sequenceOrder,
      optionalCategory: b.optionalCategory,
      sortOrder: b.sortOrder,
      name: b.name,
    }
  )
}

/** First incomplete milestone (gate, critical path, or 0-day), else first incomplete task. */
export function selectNextCriticalIncompleteTask(
  tasks: DrilldownTaskInput[]
): { taskId: string; taskName: string } | null {
  const incomplete = tasks.filter((t) => isTaskIncompleteForProgress(t.status))
  if (incomplete.length === 0) return null
  const milestones = incomplete
    .filter((t) => isPulseMilestoneTask(toPulseTask(t)))
    .sort(compareTaskDisplayOrder)
  const pick = milestones[0] ?? [...incomplete].sort(compareTaskDisplayOrder)[0]
  if (!pick) return null
  return { taskId: pick.id, taskName: pick.name }
}

export function selectCurrentStageTask(
  tasks: DrilldownTaskInput[],
  categoryName: string | null
): { taskId: string; taskName: string } | null {
  if (!categoryName) return selectNextCriticalIncompleteTask(tasks)
  const inCategory = tasks.filter((t) => {
    const name = (t.optionalCategory || "").trim() || "Uncategorized"
    return name === categoryName
  })
  return selectNextCriticalIncompleteTask(inCategory) ?? selectNextCriticalIncompleteTask(tasks)
}

export function toDashboardHouseRow(
  home: DrilldownHomeInput,
  extras?: Partial<DashboardHouseRowData>
): DashboardHouseRowData {
  const next = extras?.nextCriticalTaskId
    ? {
        taskId: extras.nextCriticalTaskId,
        taskName: extras.nextCriticalTaskName ?? null,
      }
    : selectNextCriticalIncompleteTask(home.tasks)
  return {
    homeId: home.id,
    address: home.addressOrLot,
    subdivisionName: home.subdivision.name,
    startDate: home.startDate ? home.startDate.toISOString() : null,
    forecastDate: home.forecastCompletionDate
      ? home.forecastCompletionDate.toISOString()
      : null,
    targetDate: home.targetCompletionDate ? home.targetCompletionDate.toISOString() : null,
    daysBehind: daysBehindForecast(home.forecastCompletionDate, home.targetCompletionDate),
    nextCriticalTaskId: next?.taskId ?? extras?.nextCriticalTaskId ?? null,
    nextCriticalTaskName: next?.taskName ?? extras?.nextCriticalTaskName ?? null,
    lastMilestoneTaskId: extras?.lastMilestoneTaskId ?? null,
    lastMilestoneName: extras?.lastMilestoneName ?? null,
    lastMilestoneCompletedAt: extras?.lastMilestoneCompletedAt ?? null,
    status: extras?.status,
    displayOrder: home.displayOrder,
  }
}

export function groupHomesByScheduleStatus(
  homes: DrilldownHomeInput[]
): Record<ScheduleStatus, DashboardHouseRowData[]> {
  const buckets: Record<ScheduleStatus, DashboardHouseRowData[]> = {
    completed: [],
    not_started: [],
    on_track: [],
    at_risk: [],
    behind: [],
  }

  for (const home of homes) {
    const scheduledTaskCount = home.tasks.filter((t) => t.scheduledDate != null).length
    const status = getScheduleStatus(
      home.forecastCompletionDate?.toISOString() ?? null,
      home.targetCompletionDate?.toISOString() ?? null,
      {
        startDate: home.startDate,
        scheduledTaskCount,
        isComplete: home.isComplete,
      }
    )
    buckets[status].push(toDashboardHouseRow(home, { status }))
  }

  buckets.not_started = sortPortfolioHouses(buckets.not_started, "not_started")
  buckets.on_track = sortPortfolioHouses(buckets.on_track, "on_track")
  buckets.at_risk = sortPortfolioHouses(buckets.at_risk, "at_risk")
  buckets.behind = sortPortfolioHouses(buckets.behind, "behind")
  return buckets
}

export function countByScheduleStatus(
  homes: DrilldownHomeInput[]
): { notStarted: number; onTrack: number; atRisk: number; behind: number } {
  const grouped = groupHomesByScheduleStatus(homes)
  return {
    notStarted: grouped.not_started.length,
    onTrack: grouped.on_track.length,
    atRisk: grouped.at_risk.length,
    behind: grouped.behind.length,
  }
}

function toPhaseHome(home: DrilldownHomeInput): DashboardHomeForPhase {
  return {
    id: home.id,
    addressOrLot: home.addressOrLot,
    startDate: home.startDate,
    createdAt: home.createdAt,
    isComplete: home.isComplete,
    forecastCompletionDate: home.forecastCompletionDate,
    tasks: home.tasks.map((t) => ({
      id: t.id,
      status: t.status,
      scheduledDate: t.scheduledDate,
      templateItem: {
        name: t.name,
        optionalCategory: t.optionalCategory,
        sortOrder: t.sortOrder,
        sequenceOrder: t.sequenceOrder,
      },
    })),
  }
}

export function groupHomesByPhase(
  homes: DrilldownHomeInput[]
): Map<string, { name: string; homes: DashboardHouseRowData[] }> {
  const phaseHomes = homes.map(toPhaseHome)
  const orderedCategories = deriveOrderedCategories(phaseHomes)
  const byKey = new Map<string, { name: string; homes: DashboardHouseRowData[] }>()

  homes.forEach((home, index) => {
    const phase = computeCurrentPhaseForHome(phaseHomes[index]!, orderedCategories)
    const categoryName =
      phase.key.startsWith("category:") ? phase.name : null
    const current = selectCurrentStageTask(home.tasks, categoryName)
    const row = toDashboardHouseRow(home, {
      nextCriticalTaskId: current?.taskId ?? null,
      nextCriticalTaskName: current?.taskName ?? null,
    })
    const existing = byKey.get(phase.key)
    if (existing) existing.homes.push(row)
    else byKey.set(phase.key, { name: phase.name, homes: [row] })
  })

  for (const group of byKey.values()) {
    group.homes.sort(compareBuilderHouseOrder)
  }
  return byKey
}

export function compareBuilderHouseOrder(
  a: Pick<DashboardHouseRowData, "displayOrder" | "subdivisionName" | "address">,
  b: Pick<DashboardHouseRowData, "displayOrder" | "subdivisionName" | "address">
): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
  const sub = a.subdivisionName.localeCompare(b.subdivisionName)
  if (sub !== 0) return sub
  return a.address.localeCompare(b.address)
}

export function sortPortfolioHouses(
  houses: DashboardHouseRowData[],
  status: Exclude<ScheduleStatus, "completed">
): DashboardHouseRowData[] {
  const copy = [...houses]
  if (status === "behind" || status === "at_risk") {
    copy.sort((a, b) => {
      const da = a.daysBehind ?? -1
      const db = b.daysBehind ?? -1
      if (da !== db) return db - da
      return compareBuilderHouseOrder(a, b)
    })
    return copy
  }
  if (status === "not_started") {
    copy.sort((a, b) => {
      const as = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY
      const bs = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY
      if (as !== bs) return as - bs
      return compareBuilderHouseOrder(a, b)
    })
    return copy
  }
  copy.sort((a, b) => {
    const af = a.forecastDate ? new Date(a.forecastDate).getTime() : Number.POSITIVE_INFINITY
    const bf = b.forecastDate ? new Date(b.forecastDate).getTime() : Number.POSITIVE_INFINITY
    if (af !== bf) return af - bf
    return compareBuilderHouseOrder(a, b)
  })
  return copy
}

export function filterDrilldownHouses(
  houses: DashboardHouseRowData[],
  query: string
): DashboardHouseRowData[] {
  const q = query.trim().toLowerCase()
  if (!q) return houses
  return houses.filter(
    (h) =>
      h.address.toLowerCase().includes(q) ||
      h.subdivisionName.toLowerCase().includes(q)
  )
}

export function countsMatch(dashboardCount: number, houses: DashboardHouseRowData[]): boolean {
  return dashboardCount === houses.length
}
