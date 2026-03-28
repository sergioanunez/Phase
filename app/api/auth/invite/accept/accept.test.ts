import { NextRequest } from "next/server"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/buildGuard", () => ({ isBuildTime: false, buildGuardResponse: () => new Response() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: { findFirst: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    contractor: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/invite", () => ({ hashInviteToken: vi.fn((t: string) => `hash-${t}`) }))
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }))
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(() => Promise.resolve("hashed")) } }))

const { prisma } = await import("@/lib/prisma")

describe("POST /api/auth/invite/accept (subcontractor)", () => {
  beforeEach(() => {
    vi.mocked(prisma.userInvite.findFirst).mockReset()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        user: { update: vi.fn() },
        userInvite: { update: vi.fn() },
        contractor: { update: vi.fn() },
      }
      return fn(tx)
    })
  })

  it("returns 400 when subcontractor omit phone and smsConsent", async () => {
    vi.mocked(prisma.userInvite.findFirst).mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      email: "sub@example.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      user: { id: "user-1", role: "Subcontractor", contractorId: "con-1" },
    } as any)

    const { POST } = await import("./route")
    const res = await POST(
      new NextRequest("http://localhost/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-token", password: "password123" }),
      })
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("Phone number and SMS consent")
  })

  it("returns 400 when subcontractor sends smsConsent false", async () => {
    vi.mocked(prisma.userInvite.findFirst).mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      email: "sub@example.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      user: { id: "user-1", role: "Subcontractor", contractorId: "con-1" },
    } as any)

    const { POST } = await import("./route")
    const res = await POST(
      new NextRequest("http://localhost/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "valid-token",
          password: "password123",
          phone: "9155551234",
          smsConsent: false,
        }),
      })
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("SMS consent is required")
  })

  it("returns 400 when subcontractor sends invalid phone", async () => {
    vi.mocked(prisma.userInvite.findFirst).mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      email: "sub@example.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      user: { id: "user-1", role: "Subcontractor", contractorId: "con-1" },
    } as any)

    const { POST } = await import("./route")
    const res = await POST(
      new NextRequest("http://localhost/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "valid-token",
          password: "password123",
          phone: "123",
          smsConsent: true,
        }),
      })
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("valid mobile phone number")
  })

  it("on success updates user with phoneE164 and consent fields for subcontractor", async () => {
    vi.mocked(prisma.userInvite.findFirst).mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      email: "sub@example.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      user: { id: "user-1", role: "Subcontractor", contractorId: "con-1" },
    } as any)

    let capturedUserUpdate: any
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        user: { update: vi.fn(async (args: any) => { capturedUserUpdate = args; return {} }) },
        userInvite: { update: vi.fn() },
        contractor: { update: vi.fn() },
      }
      return fn(tx)
    })

    const { POST } = await import("./route")
    const res = await POST(
      new NextRequest("http://localhost/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "valid-token",
          password: "password123",
          phone: "+19155551234",
          smsConsent: true,
        }),
      })
    )
    expect(res.status).toBe(200)
    expect(capturedUserUpdate).toBeDefined()
    expect(capturedUserUpdate.where).toEqual({ id: "user-1" })
    expect(capturedUserUpdate.data.phoneE164).toBe("+19155551234")
    expect(capturedUserUpdate.data.smsConsent).toBe(true)
    expect(capturedUserUpdate.data.smsConsentSource).toBe("invite_accept_web")
    expect(capturedUserUpdate.data.smsConsentVersion).toBe("2026-02-26_v1")
    expect(capturedUserUpdate.data.smsOptOutAt).toBe(null)
  })
})
