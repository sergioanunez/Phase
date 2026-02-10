import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const RESEND_RATE_LIMIT_PER_HOUR = 3

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const { handleApiError } = await import("@/lib/api-response")
    const {
      generateInviteToken,
      hashInviteToken,
      getInviteExpiresAt,
      sendInviteEmail,
    } = await import("@/lib/invite")

    const ctx = await requireTenantPermission("users:write")
    const userId = params.id

    const user = await prisma.user.findFirst({
      where: { id: userId, companyId: ctx.companyId },
      include: {
        contractor: { select: { id: true, companyName: true } },
      },
    })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    const allowedRoles = ["Subcontractor", "Superintendent", "Manager", "Admin"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: "This user role cannot be sent invite links" },
        { status: 400 }
      )
    }
    if (user.status !== "INVITED") {
      return NextResponse.json(
        { error: "User is not in INVITED status" },
        { status: 400 }
      )
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const inviteIdsForUser = await prisma.userInvite.findMany({
      where: { userId },
      select: { id: true },
    })
    const recentResends = await prisma.auditLog.count({
      where: {
        companyId: ctx.companyId,
        entityType: "UserInvite",
        entityId: { in: inviteIdsForUser.map((i) => i.id) },
        action: "INVITE_RESENT",
        createdAt: { gte: oneHourAgo },
      },
    })
    if (recentResends >= RESEND_RATE_LIMIT_PER_HOUR) {
      return NextResponse.json(
        { error: "Resend limit reached. Try again later." },
        { status: 429 }
      )
    }

    const latestInvite = await prisma.userInvite.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
    if (!latestInvite) {
      return NextResponse.json(
        { error: "No invite found for this user" },
        { status: 400 }
      )
    }
    if (latestInvite.usedAt) {
      return NextResponse.json(
        { error: "Invite has already been used" },
        { status: 400 }
      )
    }

    const token = generateInviteToken()
    const tokenHash = hashInviteToken(token)
    const expiresAt = getInviteExpiresAt()

    await prisma.userInvite.update({
      where: { id: latestInvite.id },
      data: {
        tokenHash,
        expiresAt,
        resendCount: { increment: 1 },
      },
    })

    const appUrl = process.env.APP_URL || "http://localhost:3000"
    const inviteLink = `${appUrl}/auth/accept-invite?token=${encodeURIComponent(token)}`

    const emailResult = await sendInviteEmail({
      to: user.email,
      name: user.name,
      inviteLink,
      expiresAt,
    })

    await createAuditLog(ctx.userId, "UserInvite", latestInvite.id, "INVITE_RESENT", null, {
      userId: user.id,
      email: user.email,
      resendCount: latestInvite.resendCount + 1,
      emailOk: emailResult.ok,
      emailError: emailResult.error,
    }, ctx.companyId)

    if (!emailResult.ok) {
      return NextResponse.json(
        {
          message: "Invite link rotated but email failed to send.",
          error: emailResult.error,
          manualLink: inviteLink,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      message: "Invite email sent.",
    })
  } catch (error: any) {
    if (isBuild()) {
      return NextResponse.json({ error: "Unavailable during build" }, { status: 503 })
    }
    try {
      const { handleApiError } = await import("@/lib/api-response")
      return handleApiError(error)
    } catch (_) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
