import { describe, it, expect } from "vitest"
import { buildScheduledSms } from "./sms/templates"

describe("buildScheduledSms", () => {
  it("starts with brand and scheduled:", () => {
    const out = buildScheduledSms({
      tenant: { name: "Cullers Homes" },
      subscription: { whiteLabelAddOn: true },
      taskName: "Plumbing Rough",
      address: "13941 Paseo Honor",
      date: new Date("2026-03-03"),
      ref: "NM2855",
    })
    expect(out).toMatch(/^Cullers Homes scheduled:/)
  })

  it("includes Ref line with code", () => {
    const out = buildScheduledSms({
      tenant: null,
      taskName: "Task",
      address: "123 Main",
      date: new Date("2026-01-15"),
      ref: "AB12CD",
    })
    expect(out).toContain("Ref: AB12CD")
  })

  it("ends with STOP/HELP compliance line", () => {
    const out = buildScheduledSms({
      tenant: null,
      taskName: "Task",
      address: "123 Main",
      date: new Date("2026-01-15"),
      ref: "XY",
    })
    expect(out).toMatch(/STOP to opt out\. HELP for help\.\s*$/)
  })

  it("does not include subdivision/community in body", () => {
    const out = buildScheduledSms({
      tenant: { name: "Cullers Homes" },
      subscription: { whiteLabelAddOn: true },
      taskName: "Plumbing Rough",
      address: "13941 Paseo Honor",
      date: new Date("2026-03-03"),
      ref: "NM2855",
    })
    expect(out).not.toMatch(/Paseos del Este/i)
  })
})
