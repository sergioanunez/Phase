import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { parseAndNormalizePhone } from "@/lib/phone"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const baseAcceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  smsConsent: z.boolean().optional(),
  email: z.string().email().optional(),
})

const SMS_CONSENT_VERSION = "2026-02-26_v1"
const SMS_CONSENT_SOURCE = "invite_accept_web"

/**
 * POST /api/auth/invite/accept
 * Public. Body: { token, password } or for Subcontractor: { token, password, phone, smsConsent }.
 * Verifies token, sets password, activates user, marks invite used.
 * For Subcontractor invites, requires phone (E.164) and smsConsent true; stores consent and updates Contractor.phone.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { hashInviteToken } = await import("@/lib/invite")
    const { createAuditLog } = await import("@/lib/audit")

    const body = await request.json()
    const data = baseAcceptSchema.parse(body)

    const tokenHash = hashInviteToken(data.token)
    const now = new Date()

    const invite = await prisma.userInvite.findFirst({
      where: { tokenHash },
      include: { user: true },
    })

    if (!invite) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 400 }
      )
    }
    if (invite.usedAt) {
      return NextResponse.json(
        { error: "This link has already been used" },
        { status: 400 }
      )
    }
    if (invite.expiresAt <= now) {
      return NextResponse.json(
        { error: "This link has expired" },
        { status: 400 }
      )
    }

    const isSubcontractor = invite.user.role === "Subcontractor"
    const { isSyntheticInviteEmail } = await import("@/lib/invite-email")
    const needsRealEmail = isSyntheticInviteEmail(invite.user.email)

    if (isSubcontractor) {
      if (!data.phone || typeof data.smsConsent !== "boolean") {
        return NextResponse.json(
          { error: "Phone number and SMS consent are required for subcontractor accounts." },
          { status: 400 }
        )
      }
      if (!data.smsConsent) {
        return NextResponse.json(
          { error: "SMS consent is required to receive text notifications." },
          { status: 400 }
        )
      }
      if (needsRealEmail && !data.email?.trim()) {
        return NextResponse.json(
          { error: "Email address is required to finish setting up your account." },
          { status: 400 }
        )
      }
      const phoneE164 = parseAndNormalizePhone(data.phone)
      if (!phoneE164) {
        return NextResponse.json(
          { error: "Please enter a valid mobile phone number." },
          { status: 400 }
        )
      }

      const realEmail = needsRealEmail ? data.email!.trim().toLowerCase() : invite.user.email
      if (needsRealEmail) {
        const emailTaken = await prisma.user.findUnique({ where: { email: realEmail } })
        if (emailTaken && emailTaken.id !== invite.userId) {
          return NextResponse.json(
            { error: "That email address is already in use." },
            { status: 400 }
          )
        }
      }

      const passwordHash = await bcrypt.hash(data.password, 10)

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: invite.userId },
          data: {
            passwordHash,
            status: "ACTIVE",
            email: realEmail,
            phoneE164,
            smsConsent: true,
            smsConsentTimestamp: now,
            smsConsentSource: SMS_CONSENT_SOURCE,
            smsConsentVersion: SMS_CONSENT_VERSION,
            smsOptOutAt: null,
          },
        })
        await tx.userInvite.update({
          where: { id: invite.id },
          data: { usedAt: now },
        })
      })

      await createAuditLog(invite.userId, "UserInvite", invite.id, "INVITE_ACCEPTED", null, {
        userId: invite.userId,
        email: realEmail,
        phoneE164,
        smsConsent: true,
      })

      return NextResponse.json({ success: true })
    }

    const passwordHash = await bcrypt.hash(data.password, 10)

    if (needsRealEmail) {
      if (!data.email?.trim()) {
        return NextResponse.json(
          { error: "Email address is required to finish setting up your account." },
          { status: 400 }
        )
      }
      const realEmail = data.email.trim().toLowerCase()
      const emailTaken = await prisma.user.findUnique({ where: { email: realEmail } })
      if (emailTaken && emailTaken.id !== invite.userId) {
        return NextResponse.json(
          { error: "That email address is already in use." },
          { status: 400 }
        )
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: invite.userId },
          data: {
            passwordHash,
            status: "ACTIVE",
            email: realEmail,
          },
        }),
        prisma.userInvite.update({
          where: { id: invite.id },
          data: { usedAt: now },
        }),
      ])

      await createAuditLog(invite.userId, "UserInvite", invite.id, "INVITE_ACCEPTED", null, {
        userId: invite.userId,
        email: realEmail,
      })

      return NextResponse.json({ success: true })
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: invite.userId },
        data: {
          passwordHash,
          status: "ACTIVE",
        },
      }),
      prisma.userInvite.update({
        where: { id: invite.id },
        data: { usedAt: now },
      }),
    ])

    await createAuditLog(invite.userId, "UserInvite", invite.id, "INVITE_ACCEPTED", null, {
      userId: invite.userId,
      email: invite.email,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error.message || "Failed to set password" },
      { status: 500 }
    )
  }
}
