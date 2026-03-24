import { describe, it, expect, vi, beforeEach } from "vitest"
import { canSendSmsByContractorId, getSmsRecipientForContractor } from "./sms-guard"

vi.mock("./prisma", () => ({
  prisma: {
    contractor: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))

const { prisma } = await import("./prisma")

describe("getSmsRecipientForContractor", () => {
  beforeEach(() => {
    vi.mocked(prisma.contractor.findUnique).mockReset()
  })

  it("returns contact and phone when an eligible contact exists", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [
        {
          id: "user-1",
          phoneE164: "+19155551234",
          smsConsent: true,
          smsOptOutAt: null,
        },
      ],
      memberships: [],
    } as any)
    const result = await getSmsRecipientForContractor("con-1")
    expect(result).toEqual({ allowed: true, contactId: "user-1", phoneE164: "+19155551234" })
  })

  it("returns no_contact when contractor has no users", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [],
      memberships: [],
    } as any)
    const result = await getSmsRecipientForContractor("con-1")
    expect(result).toEqual({ allowed: false, reason: "no_contact" })
  })

  it("includes contacts linked only via CompanyMembership (directory link)", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [],
      memberships: [
        {
          user: {
            id: "user-dir",
            phoneE164: "+19155559999",
            smsConsent: true,
            smsOptOutAt: null,
          },
        },
      ],
    } as any)
    const result = await getSmsRecipientForContractor("con-1")
    expect(result).toEqual({
      allowed: true,
      contactId: "user-dir",
      phoneE164: "+19155559999",
    })
  })

  it("returns no_contact when contractor not found", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue(null)
    const result = await getSmsRecipientForContractor("con-1")
    expect(result).toEqual({ allowed: false, reason: "no_contact" })
  })

  it("returns no_phone when no contact has phone", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [{ id: "user-1", phoneE164: null, smsConsent: true, smsOptOutAt: null }],
      memberships: [],
    } as any)
    const result = await getSmsRecipientForContractor("con-1")
    expect(result).toEqual({ allowed: false, reason: "no_phone" })
  })

  it("returns no_consent when no contact has consented", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [{ id: "user-1", phoneE164: "+19155551234", smsConsent: false, smsOptOutAt: null }],
      memberships: [],
    } as any)
    const result = await getSmsRecipientForContractor("con-1")
    expect(result).toEqual({ allowed: false, reason: "no_consent" })
  })

  it("returns opted_out when contact has opted out", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [{ id: "user-1", phoneE164: "+19155551234", smsConsent: true, smsOptOutAt: new Date() }],
      memberships: [],
    } as any)
    const result = await getSmsRecipientForContractor("con-1")
    expect(result).toEqual({ allowed: false, reason: "opted_out" })
  })
})

describe("canSendSmsByContractorId", () => {
  beforeEach(() => {
    vi.mocked(prisma.contractor.findUnique).mockReset()
  })

  it("returns allowed: true when eligible contact exists", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [{ id: "user-1", phoneE164: "+19155551234", smsConsent: true, smsOptOutAt: null }],
      memberships: [],
    } as any)
    const result = await canSendSmsByContractorId("con-1")
    expect(result).toEqual({ allowed: true })
  })

  it("returns no_contact when no users", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValue({
      id: "con-1",
      defaultContactId: null,
      users: [],
      memberships: [],
    } as any)
    const result = await canSendSmsByContractorId("con-1")
    expect(result).toEqual({ allowed: false, reason: "no_contact" })
  })
})
