import { describe, it, expect } from "vitest"
import {
  getBrand,
  formatDate,
  buildScheduledSms,
  buildCancelledSms,
  buildPunchlistSms,
} from "./templates"
import type { WhiteLabelSubscriptionLike } from "@/lib/branding/whiteLabel"

const makeSub = (overrides: Partial<WhiteLabelSubscriptionLike> = {}): WhiteLabelSubscriptionLike => ({
  companyStatus: "ACTIVE",
  subscriptionStatus: null,
  trialEndsAt: null,
  whiteLabelAddOn: false,
  ...overrides,
})

describe("SMS templates - brand and date", () => {
  it("getBrand uses tenant name when white label experience is enabled", () => {
    const sub = makeSub({
      companyStatus: "TRIAL",
      trialEndsAt: new Date("2026-03-10"),
      whiteLabelAddOn: false,
    })
    expect(
      getBrand({ name: "Cullers Homes", brandAppName: null }, sub)
    ).toBe("Cullers Homes")
  })

  it("getBrand falls back to Phase when not white label", () => {
    const inactiveSub = makeSub({
      companyStatus: "ACTIVE",
      trialEndsAt: new Date("2026-03-01"),
      whiteLabelAddOn: false,
    })
    expect(getBrand({ name: "Cullers Homes" }, inactiveSub)).toBe("Phase")
    expect(getBrand(null, inactiveSub)).toBe("Phase")
  })

  it("formatDate uses MMM d, yyyy", () => {
    const d = new Date("2026-03-06T12:00:00Z")
    const s = formatDate(d)
    expect(s).toMatch(/Mar/i)
    expect(s).toMatch(/2026/)
  })
})

describe("buildScheduledSms", () => {
  it("contains fields in correct order and no subdivision", () => {
    const date = new Date("2026-03-06T00:00:00Z")
    const sub = makeSub({
      companyStatus: "TRIAL",
      trialEndsAt: new Date("2026-03-10"),
      whiteLabelAddOn: false,
    })
    const sms = buildScheduledSms({
      tenant: { name: "Cullers Homes" },
      subscription: sub,
      taskName: "Plumbing Rough",
      address: "123 Main St",
      date,
      ref: "ABC123",
    })
    const idxBrand = sms.indexOf("Cullers Homes scheduled:")
    const idxTask = sms.indexOf("Plumbing Rough")
    const idxAddr = sms.indexOf("123 Main St")
    const idxDate = sms.indexOf("Date:")
    const idxY = sms.indexOf("Y = Confirm")
    const idxN = sms.indexOf("N = Reschedule")
    const idxRef = sms.indexOf("Ref: ABC123")
    const idxFooter = sms.indexOf("STOP to opt out.")
    expect(idxBrand).toBeLessThan(idxTask)
    expect(idxTask).toBeLessThan(idxAddr)
    expect(idxAddr).toBeLessThan(idxDate)
    expect(idxDate).toBeLessThan(idxY)
    expect(idxY).toBeLessThan(idxN)
    expect(idxN).toBeLessThan(idxRef)
    expect(idxRef).toBeLessThan(idxFooter)
    expect(sms).not.toMatch(/Paseos del Este/i)
  })
})

describe("buildCancelledSms", () => {
  it("contains apology and Ref, with STOP/HELP last", () => {
    const sms = buildCancelledSms({
      tenant: null,
      taskName: "Framing",
      address: "456 Oak St",
      date: new Date("2026-03-10"),
      ref: "XYZ9",
    })
    expect(sms).toMatch(/^Phase cancelled:/)
    expect(sms).toContain("Sorry for the inconvenience.")
    expect(sms).toContain("Ref: XYZ9")
    expect(sms).toMatch(/STOP to opt out\. HELP for help\.\s*$/)
  })
})

describe("buildPunchlistSms", () => {
  it("numbers items and includes Due line", () => {
    const sub = makeSub({
      companyStatus: "TRIAL",
      trialEndsAt: new Date("2026-03-10"),
      whiteLabelAddOn: false,
    })
    const sms = buildPunchlistSms({
      tenant: { name: "Cullers Homes" },
      subscription: sub,
      address: "789 Elm St",
      date: new Date("2026-03-06"),
      dueDate: new Date("2026-03-10"),
      items: ["Fix door", "Paint wall"],
    })
    expect(sms).toMatch(/^Cullers Homes punchlist:/)
    expect(sms).toContain("789 Elm St")
    expect(sms).toContain("Due:")
    expect(sms).toContain("1) Fix door")
    expect(sms).toContain("2) Paint wall")
    expect(sms).toMatch(/STOP to opt out\. HELP for help\.\s*$/)
  })

  it("truncates long punchlists and appends More items in Phase", () => {
    const longText = "Item ".padEnd(120, "x")
    const manyItems = Array.from({ length: 20 }, () => longText)
    const sms = buildPunchlistSms({
      tenant: null,
      address: "123 Main",
      date: new Date("2026-03-06"),
      dueDate: null,
      items: manyItems,
    })
    const lines = sms.split("\n")
    const itemLines = lines.filter((l) => /^\d+\)/.test(l))
    expect(itemLines.length).toBeLessThanOrEqual(8)
    expect(sms).toContain("More items in Phase.")
    expect(sms).toMatch(/STOP to opt out\. HELP for help\.\s*$/)
  })

  it("includes public link before STOP/HELP when provided", () => {
    const sms = buildPunchlistSms({
      tenant: { name: "Cullers Homes" },
      subscription: null,
      address: "123 Main",
      date: new Date("2026-03-06"),
      dueDate: null,
      items: ["Item one"],
      publicLink: "https://usephase.app/punchlist/AbC123",
    })
    expect(sms).toContain("View photos & details:")
    expect(sms).toContain("https://usephase.app/punchlist/AbC123")
    const idxLink = sms.indexOf("https://usephase.app/punchlist/AbC123")
    const idxStop = sms.indexOf("STOP to opt out")
    expect(idxLink).toBeLessThan(idxStop)
    expect(sms).toMatch(/STOP to opt out\. HELP for help\.\s*$/)
  })
})

