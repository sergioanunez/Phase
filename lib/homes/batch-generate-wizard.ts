/**
 * Pure helpers for the Batch Schedule Generator wizard UX.
 * No scheduling engine changes — validation / stagger UI mapping only.
 */

export type BatchWizardStep = 1 | 2 | 3

export function canContinueBatchWizardStep1(selectedHouseCount: number): boolean {
  return selectedHouseCount >= 1
}

export function canContinueBatchWizardStep2(params: {
  categoryScope: "all" | "one"
  category: string
}): boolean {
  if (params.categoryScope === "one") {
    return params.category.trim().length > 0
  }
  return true
}

export function canContinueBatchWizardStep3(baseAnchorDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(baseAnchorDate.trim())
}

/**
 * When stagger is OFF → 0 (all houses same anchor).
 * When ON → positive working-day interval (minimum 1).
 */
export function effectiveStaggerWorkingDays(params: {
  staggerEnabled: boolean
  staggerMode: "preset" | "custom"
  staggerPreset: number
  customStagger: string
}): number {
  if (!params.staggerEnabled) return 0
  if (params.staggerMode === "custom") {
    const n = parseInt(params.customStagger, 10)
    if (!Number.isFinite(n) || n < 1) return 0
    return Math.min(365, Math.floor(n))
  }
  return Math.max(1, Math.floor(params.staggerPreset || 1))
}

export function isStaggerIntervalValid(params: {
  staggerEnabled: boolean
  staggerMode: "preset" | "custom"
  staggerPreset: number
  customStagger: string
}): boolean {
  if (!params.staggerEnabled) return true
  return effectiveStaggerWorkingDays(params) >= 1
}

export type StaggerPreviewRow = {
  homeId: string
  addressOrLot: string
  orderIndex: number
  /** ISO date-only from computeStaggeredAnchorDate */
  anchorDate: string
}

export function wizardStepTitle(step: BatchWizardStep): string {
  switch (step) {
    case 1:
      return "Select Houses"
    case 2:
      return "Choose Work"
    case 3:
      return "Start Dates"
  }
}

export function wizardStepHelper(step: BatchWizardStep): string {
  switch (step) {
    case 1:
      return "Choose the homes you want to generate schedules for."
    case 2:
      return "Choose which part of the construction schedule Phase should generate."
    case 3:
      return "Choose when the selected homes should begin."
  }
}
