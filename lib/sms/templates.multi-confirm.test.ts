import { describe, it, expect } from "vitest"
import { buildScheduledSms, buildMultiPendingConfirmationsSms } from "./templates"

describe("confirmation SMS templates", () => {
  it("single pending uses Y/N reply copy", () => {
    const body = buildScheduledSms({
      tenant: { name: "Cullers Homes" },
      taskName: "Plumbing Rough",
      address: "532 Basketflower Dr.",
      date: new Date("2026-06-30T12:00:00"),
      ref: "AB12CD",
    })
    expect(body).toContain("Cullers Homes")
    expect(body).toContain("Plumbing Rough at 532 Basketflower Dr.")
    expect(body).toContain("Reply Y to confirm or N if unavailable.")
    expect(body).toContain("Ref: AB12CD")
    expect(body).toContain("STOP to opt out")
  })

  it("multi pending uses magic link copy without Y/N", () => {
    const body = buildMultiPendingConfirmationsSms({
      tenant: { name: "Cullers Homes" },
      pendingCount: 3,
      magicLink: "https://usephase.app/c/test-token",
    })
    expect(body).toContain("You have 3 pending work confirmations.")
    expect(body).toContain("https://usephase.app/c/test-token")
    expect(body).not.toMatch(/Reply Y/)
    expect(body).toContain("STOP to opt out")
  })
})
