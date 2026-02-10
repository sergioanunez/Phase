import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import bcrypt from "bcryptjs"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required").max(200),
})

/**
 * POST /api/auth/signup
 * Create a new user (for trial flow). Does not sign in; client should call signIn after.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const body = await request.json()
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { email, password, name } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in instead." },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        name: name.trim(),
        passwordHash,
        role: "Admin",
        status: "ACTIVE",
        companyId: null,
        isActive: true,
      },
    })

    return NextResponse.json({ ok: true, email })
  } catch (error) {
    return handleApiError(error)
  }
}
