import { describe, it, expect } from "vitest"
import {
  generateConfirmationAccessToken,
  hashConfirmationAccessToken,
  buildConfirmationMagicLink,
  getConfirmationAccessExpiresAt,
} from "./confirmation-access-token"

describe("confirmation access token", () => {
  it("generates unguessable tokens and stable hashes", () => {
    const a = generateConfirmationAccessToken()
    const b = generateConfirmationAccessToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(32)
    expect(hashConfirmationAccessToken(a)).toBe(hashConfirmationAccessToken(a))
    expect(hashConfirmationAccessToken(a)).not.toBe(hashConfirmationAccessToken(b))
  })

  it("builds branded /c/ magic links", () => {
    expect(buildConfirmationMagicLink("abc123", "https://usephase.app")).toBe(
      "https://usephase.app/c/abc123"
    )
  })

  it("expires after 7 days", () => {
    const from = new Date("2026-07-15T12:00:00Z")
    const exp = getConfirmationAccessExpiresAt(from)
    expect(exp.toISOString().slice(0, 10)).toBe("2026-07-22")
  })
})
