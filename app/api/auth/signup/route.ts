import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import bcrypt from "bcryptjs"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { signupSchema } from "./signup-schema"
import { SMS_CONSENT_SOURCE_START_TRIAL, SMS_CONSENT_VERSION } from "@/lib/sms-consent"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/**
 * POST /api/auth/signup
 * Create a new user (for trial flow). Does not sign in; client should call signIn after.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const body = await request.json()
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { email, password, name, smsConsent } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in instead." },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const smsConsentTimestamp = smsConsent ? new Date() : null

    await prisma.user.create({
      data: {
        email,
        name: name.trim(),
        passwordHash,
        role: "Admin",
        status: "ACTIVE",
        companyId: null,
        isActive: true,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        smsConsent: !!smsConsent,
        smsConsentTimestamp,
        smsConsentSource: smsConsent ? SMS_CONSENT_SOURCE_START_TRIAL : null,
        smsConsentVersion: smsConsent ? SMS_CONSENT_VERSION : null,
      },
    })

    return NextResponse.json({ ok: true, email })
  } catch (error) {
    return handleApiError(error)
  }
}
