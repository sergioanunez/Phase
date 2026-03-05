import { describe, it, expect } from "vitest"
import {
  isTrialActive,
  hasPaidWhiteLabel,
  isWhiteLabelExperienceEnabled,
  type WhiteLabelSubscriptionLike,
} from "./whiteLabel"

const makeSub = (overrides: Partial<WhiteLabelSubscriptionLike> = {}): WhiteLabelSubscriptionLike => ({
  companyStatus: "ACTIVE",
  subscriptionStatus: null,
  trialEndsAt: null,
  whiteLabelAddOn: false,
  ...overrides,
})

describe("whiteLabel - isTrialActive", () => {
  it("returns false when no trialEndsAt", () => {
    const sub = makeSub({ companyStatus: "TRIAL", trialEndsAt: null })
    expect(isTrialActive(sub, new Date("2026-03-05"))).toBe(false)
  })

  it("returns false when trial has expired", () => {
    const now = new Date("2026-03-05")
    const yesterday = new Date("2026-03-04")
    const sub = makeSub({ companyStatus: "TRIAL", trialEndsAt: yesterday })
    expect(isTrialActive(sub, now)).toBe(false)
  })

  it("returns true when company is TRIAL and trialEndsAt in future", () => {
    const now = new Date("2026-03-05")
    const tomorrow = new Date("2026-03-06")
    const sub = makeSub({ companyStatus: "TRIAL", trialEndsAt: tomorrow })
    expect(isTrialActive(sub, now)).toBe(true)
  })

  it("returns true when Stripe is trialing and trialEndsAt in future", () => {
    const now = new Date("2026-03-05")
    const future = new Date("2026-03-10")
    const sub = makeSub({ companyStatus: "DISABLED", subscriptionStatus: "trialing", trialEndsAt: future })
    expect(isTrialActive(sub, now)).toBe(true)
  })
})

describe("whiteLabel - hasPaidWhiteLabel", () => {
  it("returns true only when whiteLabelAddOn is truthy", () => {
    expect(hasPaidWhiteLabel(makeSub({ whiteLabelAddOn: true }))).toBe(true)
    expect(hasPaidWhiteLabel(makeSub({ whiteLabelAddOn: false }))).toBe(false)
    expect(hasPaidWhiteLabel(null)).toBe(false)
  })
})

describe("whiteLabel - isWhiteLabelExperienceEnabled", () => {
  const now = new Date("2026-03-05")

  it("returns false when no trial and no paid add-on", () => {
    const sub = makeSub({
      companyStatus: "ACTIVE",
      trialEndsAt: new Date("2026-03-01"),
      whiteLabelAddOn: false,
    })
    expect(isWhiteLabelExperienceEnabled(sub, now)).toBe(false)
  })

  it("returns true when paid white label add-on present", () => {
    const sub = makeSub({
      companyStatus: "ACTIVE",
      trialEndsAt: new Date("2026-03-01"),
      whiteLabelAddOn: true,
    })
    expect(isWhiteLabelExperienceEnabled(sub, now)).toBe(true)
  })

  it("returns true during active trial even without paid add-on", () => {
    const sub = makeSub({
      companyStatus: "TRIAL",
      trialEndsAt: new Date("2026-03-10"),
      whiteLabelAddOn: false,
    })
    expect(isWhiteLabelExperienceEnabled(sub, now)).toBe(true)
  })

  it("returns true when Stripe is trialing and trialEndsAt in future, even if companyStatus is DISABLED", () => {
    const sub = makeSub({
      companyStatus: "DISABLED",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-03-10"),
      whiteLabelAddOn: false,
    })
    expect(isWhiteLabelExperienceEnabled(sub, now)).toBe(true)
  })
})

