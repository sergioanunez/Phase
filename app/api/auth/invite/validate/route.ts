import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashInviteToken } from "@/lib/invite"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * GET /api/auth/invite/validate?token=...
 * Public. Returns minimal user info if token is valid (not used, not expired).
 */
export async function GET(request: NextRequest) {
  try {
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
