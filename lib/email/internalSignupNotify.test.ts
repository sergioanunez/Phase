import { describe, expect, it } from "vitest"
import { buildInternalSignupNotifyText } from "./internalSignupNotify"

describe("buildInternalSignupNotifyText", () => {
  it("includes signup fields in the body", () => {
    const text = buildInternalSignupNotifyText({
      name: "John Smith",
      email: "john@builder.com",
      role: "Admin",
      companyName: "Smith Homes",
      signupSource: "/start-trial",
      signedUpAt: new Date("2026-03-23T22:42:00.000Z"),
    })

    expect(text).toContain("New Phase signup")
    expect(text).toContain("Name: John Smith")
    expect(text).toContain("Email: john@builder.com")
    expect(text).toContain("Company: Smith Homes")
    expect(text).toContain("Role: Admin")
    expect(text).toContain("Source: /start-trial")
    expect(text).toContain("Signed up:")
  })

  it("uses em dash placeholders for missing optional fields", () => {
    const text = buildInternalSignupNotifyText({
      name: "",
      email: "a@b.com",
    })
    expect(text).toContain("Company: —")
    expect(text).toContain("Role: —")
    expect(text).toContain("Source: —")
  })
})
