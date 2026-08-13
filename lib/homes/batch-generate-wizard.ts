/**
 * Pure helpers for the Batch Schedule Generator wizard UX.
 * Client-safe (no Node builtins). Validation / stagger UI mapping only.
 */

import { addWorkingDays, normalizeToWorkingDay } from "@/lib/working-days"

export type BatchWizardStep = 1 | 2 | 3

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Anchor for house at order index with working-day stagger from base. */
export function computeStaggeredAnchorDate(
  baseAnchorDate: Date,
  orderIndex: number,
  staggerWorkingDays: number
): Date {
  const base = normalizeToWorkingDay(startOfDay(baseAnchorDate))
  const stagger = Math.max(0, Math.floor(staggerWorkingDays))
  if (orderIndex <= 0 || stagger === 0) return base
  return addWorkingDays(base, orderIndex * stagger)
}

export function canContinueBatchWizardStep1(selectedHouseCount: number): boolean {
  return selectedHouseCount >= 1
}

export function canContinueBatchWizardStep2(params: {
  workScope: "all" | "category" | "contractor"
  category: string
  contractorId: string | null
}): boolean {
  if (params.workScope === "category") {
    return params.category.trim().length > 0
  }
  if (params.workScope === "contractor") {
    return Boolean(params.contractorId)
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
      return "Choose all work, one category, or one contractor / trade."
    case 3:
      return "Choose when the selected homes should begin."
  }
}
