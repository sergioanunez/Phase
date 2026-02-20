import { describe, it, expect } from "vitest"
import { signupSchema } from "./signup-schema"

const validPayload = {
  email: "test@example.com",
  password: "password123",
  name: "Test User",
  termsAccepted: true,
}

describe("signup schema", () => {
  it("accepts valid payload with termsAccepted true", () => {
    const result = signupSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it("rejects when termsAccepted is false", () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      termsAccepted: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.flatten().formErrors?.[0] ?? ""
      expect(msg).toContain("Terms")
    }
  })

  it("rejects when termsAccepted is missing", () => {
    const result = signupSchema.safeParse({
      email: validPayload.email,
      password: validPayload.password,
      name: validPayload.name,
    })
    expect(result.success).toBe(false)
  })
})
