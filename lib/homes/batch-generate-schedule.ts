/**
 * Multi-house batch schedule generation — reuses buildSchedulePreview / CPM.
 * Stagger uses working days only (addWorkingDays).
 */

import { normalizeToWorkingDay } from "@/lib/working-days"
import {
  buildSchedulePreview,
  proposalsToScheduledDates,
  type GenerateScheduleMode,
  type GenerateSchedulePreview,
  type ScheduleTaskInput,
} from "@/lib/homes/generate-schedule"
import { computeStaggeredAnchorDate } from "@/lib/homes/batch-generate-wizard"

export { computeStaggeredAnchorDate } from "@/lib/homes/batch-generate-wizard"

export type BatchHouseInput = {
  homeId: string
  addressOrLot: string
  startDate: Date | null
  tasks: ScheduleTaskInput[]
  /** Optional status label for UI (Not started / In progress / …). */
  statusLabel?: string | null
}

export type BatchHomePreviewResult = {
  homeId: string
  addressOrLot: string
  statusLabel: string | null
  orderIndex: number
  anchorDate: string
  preview: GenerateSchedulePreview
  applyCount: number
  ready: boolean
  needsReview: boolean
}

export type BatchSchedulePreview = {
  mode: GenerateScheduleMode
  modeLabel: string
  category: string | null
  categoryLabel: string
  respectExistingScheduledDates: boolean
  scheduleBehaviorLabel: string
  baseAnchorDate: string
  staggerWorkingDays: number
  houseCount: number
  readyCount: number
  reviewCount: number
  totalProposedTasks: number
  totalApplyTasks: number
  homes: BatchHomePreviewResult[]
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function toDateOnlyISO(d: Date): string {
  return startOfDay(d).toISOString()
}

export function buildBatchSchedulePreview(params: {
  housesInOrder: BatchHouseInput[]
  templateDeps: Array<{ templateItemId: string; dependsOnItemId: string }>
  baseAnchorDate: Date
  staggerWorkingDays: number
  mode: GenerateScheduleMode
  respectExistingScheduledDates?: boolean
  category?: string | null
}): BatchSchedulePreview {
  const {
    housesInOrder,
    templateDeps,
    baseAnchorDate,
    staggerWorkingDays,
    mode,
    respectExistingScheduledDates = true,
    category = null,
  } = params

  const homes: BatchHomePreviewResult[] = housesInOrder.map((house, orderIndex) => {
    const anchor = computeStaggeredAnchorDate(
      baseAnchorDate,
      orderIndex,
      staggerWorkingDays
    )
    const preview = buildSchedulePreview({
      home: { startDate: house.startDate },
      tasks: house.tasks,
      templateDeps,
      anchorDate: anchor,
      mode,
      respectExistingScheduledDates,
      category,
    })
    const applyCount = proposalsToScheduledDates(preview).length
    const needsReview =
      Boolean(preview.error) ||
      preview.blockedCount > 0 ||
      preview.hasCycle ||
      (preview.proposedCount === 0 && applyCount === 0)
    const ready = !needsReview && applyCount > 0

    return {
      homeId: house.homeId,
      addressOrLot: house.addressOrLot,
      statusLabel: house.statusLabel ?? null,
      orderIndex,
      anchorDate: toDateOnlyISO(anchor),
      preview,
      applyCount,
      ready,
      needsReview,
    }
  })

  const readyCount = homes.filter((h) => h.ready).length
  const reviewCount = homes.filter((h) => h.needsReview).length
  const totalProposedTasks = homes.reduce((n, h) => n + h.preview.proposedCount, 0)
  const totalApplyTasks = homes.reduce((n, h) => n + h.applyCount, 0)
  const first = homes[0]?.preview

  return {
    mode,
    modeLabel: first?.modeLabel ?? (mode === "critical" ? "Critical tasks only" : "All remaining tasks"),
    category,
    categoryLabel: category ? category : "All categories",
    respectExistingScheduledDates,
    scheduleBehaviorLabel:
      first?.scheduleBehaviorLabel ??
      (respectExistingScheduledDates
        ? "Respect existing scheduled dates"
        : "Recalculate all eligible tasks"),
    baseAnchorDate: toDateOnlyISO(normalizeToWorkingDay(startOfDay(baseAnchorDate))),
    staggerWorkingDays: Math.max(0, Math.floor(staggerWorkingDays)),
    houseCount: homes.length,
    readyCount,
    reviewCount,
    totalProposedTasks,
    totalApplyTasks,
    homes,
  }
}
