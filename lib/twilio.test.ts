import { describe, it, expect } from "vitest"
import { buildConfirmationSms } from "./twilio"

describe("buildConfirmationSms", () => {
  it("starts with tenant name and scheduled:", () => {
    const out = buildConfirmationSms({
      tenantName: "Cullers Homes",
      taskName: "Plumbing Rough",
      address: "13941 Paseo Honor",
      community: "Paseos del Este",
      scheduledDateMmDd: "03/03",
      refCode: "NM2855",
    })
    expect(out).toMatch(/^Cullers Homes scheduled:/)
  })

  it("includes Ref line with code", () => {
    const out = buildConfirmationSms({
      tenantName: "Phase",
      taskName: "Task",
      address: "123 Main",
      scheduledDateMmDd: "01/15",
      refCode: "AB12CD",
    })
    expect(out).toContain("Ref: AB12CD")
  })

  it("ends with STOP/HELP compliance line", () => {
    const out = buildConfirmationSms({
      tenantName: "Phase",
      taskName: "Task",
      address: "123 Main",
      scheduledDateMmDd: "01/15",
      refCode: "XY",
    })
    expect(out).toMatch(/STOP to opt out\. HELP for help\.\s*$/)
  })

  it("omits community line when community is missing (no blank line)", () => {
    const out = buildConfirmationSms({
      tenantName: "Phase",
      taskName: "Task",
      address: "123 Main",
      scheduledDateMmDd: "03/03",
      refCode: "NM2855",
    })
    expect(out).not.toContain("\n\n\n03/03") // no double blank before date
    expect(out).toContain("123 Main\n03/03")
  })

  it("includes community when provided", () => {
    const out = buildConfirmationSms({
      tenantName: "Cullers Homes",
      taskName: "Plumbing Rough",
      address: "13941 Paseo Honor",
      community: "Paseos del Este",
      scheduledDateMmDd: "03/03",
      refCode: "NM2855",
    })
    expect(out).toContain("Paseos del Este")
    expect(out).toContain("13941 Paseo Honor\nPaseos del Este\n03/03")
  })

  it("has exact line breaks and Y/N block", () => {
    const out = buildConfirmationSms({
      tenantName: "Cullers Homes",
      taskName: "Plumbing Rough",
      address: "13941 Paseo Honor",
      community: "Paseos del Este",
      scheduledDateMmDd: "03/03",
      refCode: "NM2855",
    })
    expect(out).toContain("Y = Confirm")
    expect(out).toContain("N = Reschedule")
    const lines = out.split("\n")
    expect(lines.some((l) => l === "Y = Confirm")).toBe(true)
    expect(lines.some((l) => l === "N = Reschedule")).toBe(true)
  })
})
