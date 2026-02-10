import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

/**
 * GET /api/auth/invite/validate?token=...
 * Public. Returns minimal user info if token is valid (not used, not expired).
 */
export async function GET(request: NextRequest) {
  try {
    if (isBuild()) {
      return NextResponse.json({ valid: false }, { status: 200 })
    }
    const { prisma } = await import("@/lib/prisma")
    const { hashInviteToken } = await import("@/lib/invite")

    const token = request.nextUrl.searchParams.get("token")
    if (!token || token.length < 10) {
      return NextResponse.json({ valid: false }, { status: 200 })
    }

    const tokenHash = hashInviteToken(token)
    const now = new Date()

    const invite = await prisma.userInvite.findFirst({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    if (!invite || invite.usedAt || invite.expiresAt <= now) {
      return NextResponse.json({ valid: false }, { status: 200 })
    }

    return NextResponse.json({
      valid: true,
      email: invite.user.email,
      name: invite.user.name,
    })
  } catch {
    return NextResponse.json({ valid: false }, { status: 200 })
  }
}
