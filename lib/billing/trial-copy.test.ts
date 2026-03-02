import { describe, it, expect } from "vitest"
import { getTrialBannerMiddleText } from "./trial-copy"

describe("getTrialBannerMiddleText", () => {
  it("returns Trial ended when trialExpired is true", () => {
    expect(getTrialBannerMiddleText(0, true)).toBe("Trial ended")
    expect(getTrialBannerMiddleText(5, true)).toBe("Trial ended")
    expect(getTrialBannerMiddleText(null, true)).toBe("Trial ended")
  })

  it("returns Trial active when daysRemaining is null and not expired", () => {
    expect(getTrialBannerMiddleText(null, false)).toBe("Trial active")
  })

  it("returns X days left for 15+ days", () => {
    expect(getTrialBannerMiddleText(15, false)).toBe("15 days left")
    expect(getTrialBannerMiddleText(30, false)).toBe("30 days left")
  })

  it("returns X days remaining for 7-14 days", () => {
    expect(getTrialBannerMiddleText(7, false)).toBe("7 days remaining")
    expect(getTrialBannerMiddleText(14, false)).toBe("14 days remaining")
  })

  it("returns Ends in X days for 3-6 days", () => {
    expect(getTrialBannerMiddleText(3, false)).toBe("Ends in 3 days")
    expect(getTrialBannerMiddleText(6, false)).toBe("Ends in 6 days")
  })

  it("returns Ends in 1 day for 1 day remaining", () => {
    expect(getTrialBannerMiddleText(1, false)).toBe("Ends in 1 day")
  })

  it("returns Ends in 2 days for 2 days remaining", () => {
    expect(getTrialBannerMiddleText(2, false)).toBe("Ends in 2 days")
  })

  it("returns Ends today when daysRemaining is 0 and not expired", () => {
    expect(getTrialBannerMiddleText(0, false)).toBe("Ends today")
  })
})
