import { describe, it, expect, vi, beforeEach } from "vitest"
import { canSendSmsByContractorId } from "./sms-guard"

vi.mock("./prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}))

const { prisma } = await import("./prisma")

describe("canSendSmsByContractorId", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findFirst).mockReset()
  })

  it("returns allowed: true when user has phone, consent, and no opt-out", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      phoneE164: "+19155551234",
      smsConsent: true,
      smsOptOutAt: null,
    } as any)
    const result = await canSendSmsByContractorId("contractor-1")
    expect(result).toEqual({ allowed: true })
  })

  it("returns no_phone when no user linked to contractor", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    const result = await canSendSmsByContractorId("contractor-1")
    expect(result).toEqual({ allowed: false, reason: "no_phone" })
  })

  it("returns no_phone when user has no phoneE164", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      phoneE164: null,
      smsConsent: true,
      smsOptOutAt: null,
    } as any)
    const result = await canSendSmsByContractorId("contractor-1")
    expect(result).toEqual({ allowed: false, reason: "no_phone" })
  })

  it("returns no_consent when user has not consented", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      phoneE164: "+19155551234",
      smsConsent: false,
      smsOptOutAt: null,
    } as any)
    const result = await canSendSmsByContractorId("contractor-1")
    expect(result).toEqual({ allowed: false, reason: "no_consent" })
  })

  it("returns opted_out when user has smsOptOutAt set", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      phoneE164: "+19155551234",
      smsConsent: true,
      smsOptOutAt: new Date(),
    } as any)
    const result = await canSendSmsByContractorId("contractor-1")
    expect(result).toEqual({ allowed: false, reason: "opted_out" })
  })
})
