import { describe, it, expect } from "vitest"
import {
  getBrand,
  formatDate,
  buildScheduledSms,
  buildCancelledSms,
  buildPunchlistSms,
} from "./templates"

describe("SMS templates - brand and date", () => {
  it("getBrand uses tenant name when white label enabled", () => {
    expect(
      getBrand({ whiteLabelEnabled: true, name: "Cullers Homes", brandAppName: null })
    ).toBe("Cullers Homes")
  })

  it("getBrand falls back to Phase when not white label", () => {
    expect(getBrand({ whiteLabelEnabled: false, name: "Cullers Homes" })).toBe("Phase")
    expect(getBrand(null)).toBe("Phase")
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
    const sms = buildScheduledSms({
      tenant: { whiteLabelEnabled: true, name: "Cullers Homes" },
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
    const sms = buildPunchlistSms({
      tenant: { whiteLabelEnabled: true, name: "Cullers Homes" },
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
})

