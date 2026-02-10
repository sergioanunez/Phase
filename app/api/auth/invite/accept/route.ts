import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

/**
 * POST /api/auth/invite/accept
 * Public. Body: { token, password }. Verifies token, sets password, activates user, marks invite used.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { hashInviteToken } = await import("@/lib/invite")
    const { createAuditLog } = await import("@/lib/audit")

    const body = await request.json()
    const data = acceptSchema.parse(body)

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

    const passwordHash = await bcrypt.hash(data.password, 10)

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
