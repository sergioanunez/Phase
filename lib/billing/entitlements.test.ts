import { describe, it, expect, vi, beforeEach } from "vitest"
import { getBillingGates } from "./entitlements"

const now = new Date("2026-06-15T12:00:00Z")
const future = new Date("2026-07-15T12:00:00Z")
const past = new Date("2026-05-15T12:00:00Z")

describe("getBillingGates", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: now.getTime() })
  })

  it("returns all false when company is not found", async () => {
    const prisma = {
      company: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    const gates = await getBillingGates(prisma as any, "tenant-1")
    expect(gates).toEqual({
      canScheduleTasks: false,
      canCreatePunchlists: false,
      canCreateHomes: false,
      canCreateSubdivisions: false,
    })
  })

  it("returns all true when subscription is active", async () => {
    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue({
          status: "ACTIVE",
          subscriptionStatus: "active",
          trialStartsAt: null,
          trialEndsAt: null,
        }),
      },
    }
    const gates = await getBillingGates(prisma as any, "tenant-1")
    expect(gates.canScheduleTasks).toBe(true)
    expect(gates.canCreatePunchlists).toBe(true)
    expect(gates.canCreateHomes).toBe(true)
    expect(gates.canCreateSubdivisions).toBe(true)
  })

  it("returns all true when trialing and trial not expired", async () => {
    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue({
          status: "TRIAL",
          subscriptionStatus: "trialing",
          trialStartsAt: past,
          trialEndsAt: future,
        }),
      },
    }
    const gates = await getBillingGates(prisma as any, "tenant-1")
    expect(gates.canScheduleTasks).toBe(true)
    expect(gates.canCreatePunchlists).toBe(true)
    expect(gates.canCreateHomes).toBe(true)
    expect(gates.canCreateSubdivisions).toBe(true)
  })

  it("returns all false when trial expired and not subscribed", async () => {
    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue({
          status: "TRIAL",
          subscriptionStatus: "trialing",
          trialStartsAt: past,
          trialEndsAt: past,
        }),
      },
    }
    const gates = await getBillingGates(prisma as any, "tenant-1")
    expect(gates.canScheduleTasks).toBe(false)
    expect(gates.canCreatePunchlists).toBe(false)
    expect(gates.canCreateHomes).toBe(false)
    expect(gates.canCreateSubdivisions).toBe(false)
  })

  it("returns all false when status is TRIAL but no trialEndsAt and no subscription", async () => {
    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue({
          status: "TRIAL",
          subscriptionStatus: null,
          trialStartsAt: null,
          trialEndsAt: null,
        }),
      },
    }
    const gates = await getBillingGates(prisma as any, "tenant-1")
    expect(gates.canScheduleTasks).toBe(false)
    expect(gates.canCreatePunchlists).toBe(false)
    expect(gates.canCreateHomes).toBe(false)
    expect(gates.canCreateSubdivisions).toBe(false)
  })
})
