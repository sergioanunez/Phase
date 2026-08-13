import { describe, expect, it } from "vitest"
import {
  canContinueBatchWizardStep1,
  canContinueBatchWizardStep2,
  canContinueBatchWizardStep3,
  effectiveStaggerWorkingDays,
  isStaggerIntervalValid,
  wizardStepTitle,
} from "./batch-generate-wizard"
import { computeStaggeredAnchorDate } from "./batch-generate-wizard"

describe("batch wizard step gates", () => {
  it("opens conceptually on step 1 (title)", () => {
    expect(wizardStepTitle(1)).toBe("Select Houses")
  })

  it("cannot continue without selecting a house", () => {
    expect(canContinueBatchWizardStep1(0)).toBe(false)
    expect(canContinueBatchWizardStep1(1)).toBe(true)
  })

  it("requires category when one-category scope selected", () => {
    expect(
      canContinueBatchWizardStep2({
        workScope: "category",
        category: "",
        contractorId: null,
      })
    ).toBe(false)
    expect(
      canContinueBatchWizardStep2({
        workScope: "category",
        category: "Foundation",
        contractorId: null,
      })
    ).toBe(true)
    expect(
      canContinueBatchWizardStep2({
        workScope: "all",
        category: "",
        contractorId: null,
      })
    ).toBe(true)
  })

  it("requires contractor when contractor scope selected", () => {
    expect(
      canContinueBatchWizardStep2({
        workScope: "contractor",
        category: "",
        contractorId: null,
      })
    ).toBe(false)
    expect(
      canContinueBatchWizardStep2({
        workScope: "contractor",
        category: "",
        contractorId: "c1",
      })
    ).toBe(true)
  })

  it("step 3 requires a start date", () => {
    expect(canContinueBatchWizardStep3("")).toBe(false)
    expect(canContinueBatchWizardStep3("2026-08-10")).toBe(true)
  })
})

describe("batch wizard stagger toggle", () => {
  it("stagger OFF maps to 0 working days (same anchor)", () => {
    expect(
      effectiveStaggerWorkingDays({
        staggerEnabled: false,
        staggerMode: "preset",
        staggerPreset: 2,
        customStagger: "2",
      })
    ).toBe(0)
  })

  it("stagger controls validity: hidden/off is always valid", () => {
    expect(
      isStaggerIntervalValid({
        staggerEnabled: false,
        staggerMode: "custom",
        staggerPreset: 2,
        customStagger: "",
      })
    ).toBe(true)
  })

  it("checking stagger reveals interval; presets are 1–3 working days", () => {
    expect(
      effectiveStaggerWorkingDays({
        staggerEnabled: true,
        staggerMode: "preset",
        staggerPreset: 1,
        customStagger: "",
      })
    ).toBe(1)
    expect(
      effectiveStaggerWorkingDays({
        staggerEnabled: true,
        staggerMode: "preset",
        staggerPreset: 2,
        customStagger: "",
      })
    ).toBe(2)
  })

  it("custom stagger requires a positive number", () => {
    expect(
      isStaggerIntervalValid({
        staggerEnabled: true,
        staggerMode: "custom",
        staggerPreset: 2,
        customStagger: "0",
      })
    ).toBe(false)
    expect(
      effectiveStaggerWorkingDays({
        staggerEnabled: true,
        staggerMode: "custom",
        staggerPreset: 2,
        customStagger: "4",
      })
    ).toBe(4)
  })

  it("turning stagger OFF returns all houses to same anchor", () => {
    const monday = new Date("2026-08-10T12:00:00")
    const off = effectiveStaggerWorkingDays({
      staggerEnabled: false,
      staggerMode: "preset",
      staggerPreset: 2,
      customStagger: "2",
    })
    expect(computeStaggeredAnchorDate(monday, 0, off).toISOString().slice(0, 10)).toBe(
      "2026-08-10"
    )
    expect(computeStaggeredAnchorDate(monday, 3, off).toISOString().slice(0, 10)).toBe(
      "2026-08-10"
    )
  })

  it("1 and 2 working-day stagger still skip weekends", () => {
    const monday = new Date("2026-08-10T12:00:00")
    expect(computeStaggeredAnchorDate(monday, 1, 1).toISOString().slice(0, 10)).toBe(
      "2026-08-11"
    )
    expect(computeStaggeredAnchorDate(monday, 3, 2).toISOString().slice(0, 10)).toBe(
      "2026-08-18"
    )
  })
})
