import type { DashboardHomeForPhase } from "@/lib/dashboard/phaseDistribution"
import { isTaskResolvedForScheduling } from "@/lib/task-status"
import {
  COMPLETE_PHASE_KEY,
  NOT_STARTED_PHASE_KEY,
  computeCurrentPhaseForHome,
  deriveOrderedCategories,
} from "@/lib/dashboard/phaseDistribution"
import type { TenantTemplatePhaseData } from "@/lib/forecast-template-total"

/** Home + task snapshots needed for phase detection and incomplete duration in the active category. */
export type HomeForForecastPhaseRemaining = {
  id: string
  addressOrLot: string
  startDate: Date | null
  createdAt: Date
  isComplete: boolean
  tasks: Array<{
    id: string
    status: string
    scheduledDate: Date | null
    durationDaysSnapshot: number
    templateItem: {
      name: string
      optionalCategory: string | null
      sortOrder: number
      sequenceOrder: number | null
    }
  }>
}

function homeTaskCategory(t: HomeForForecastPhaseRemaining["tasks"][number]): string {
  return ((t.templateItem.optionalCategory || "").trim() || "Uncategorized")
}

function toPhaseDistributionHome(h: HomeForForecastPhaseRemaining): DashboardHomeForPhase {
  return {
    id: h.id,
    addressOrLot: h.addressOrLot,
    startDate: h.startDate,
    createdAt: h.createdAt,
    isComplete: h.isComplete,
    tasks: h.tasks.map((t) => ({
      id: t.id,
      status: t.status,
      scheduledDate: t.scheduledDate,
      templateItem: {
        name: t.templateItem.name,
        optionalCategory: t.templateItem.optionalCategory,
        sortOrder: t.templateItem.sortOrder,
        sequenceOrder: t.templateItem.sequenceOrder,
      },
    })),
  }
}

/**
 * Remaining working days from the house's current template phase (Construction Timeline / Flow logic):
 * sum of incomplete task durations in the current category + category critical-path totals for all later categories.
 * Not started → full template WD; complete → 0.
 */
export function computePhaseBasedRemainingWorkingDays(
  home: HomeForForecastPhaseRemaining,
  data: TenantTemplatePhaseData
): number | null {
  const totalWd = data.totalBuildWorkingDays
  if (totalWd == null || totalWd <= 0) return null
  if (home.tasks.length === 0) return totalWd

  const phaseHome = toPhaseDistributionHome(home)
  const orderedCategories = deriveOrderedCategories([phaseHome])
  const phase = computeCurrentPhaseForHome(phaseHome, orderedCategories)

  if (phase.key === COMPLETE_PHASE_KEY) return 0
  if (phase.key === NOT_STARTED_PHASE_KEY) return totalWd

  const phaseName = phase.name
  const ordered = data.orderedTemplateCategoryNames
  const idx = ordered.indexOf(phaseName)

  let incompleteWdInCurrent = 0
  for (const t of home.tasks) {
    if (isTaskResolvedForScheduling(t.status)) continue
    if (homeTaskCategory(t) !== phaseName) continue
    incompleteWdInCurrent += Math.max(0, t.durationDaysSnapshot)
  }

  if (idx === -1) {
    const cum = data.cumulativeByCategoryName.get(phaseName)
    if (cum != null) return cum
    return totalWd
  }

  let laterCatWd = 0
  for (let j = idx + 1; j < ordered.length; j++) {
    laterCatWd += data.durationByCategory.get(ordered[j]) ?? 0
  }

  return incompleteWdInCurrent + laterCatWd
}
