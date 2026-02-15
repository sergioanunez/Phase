import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const { handleApiError } = await import("@/lib/api-response")
    const {
      generateInviteToken,
      hashInviteToken,
      getInviteExpiresAt,
      buildInviteLink,
      sendInviteEmailWithIdempotency,
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

    const { getServerAppUrl } = await import("@/lib/env")
    const inviteLink = buildInviteLink(getServerAppUrl(), token)
    const idempotencyKey = `invite:${ctx.companyId ?? ""}:${userId}`

    const emailResult = await sendInviteEmailWithIdempotency(prisma, {
      idempotencyKey,
      companyId: ctx.companyId,
      userId: user.id,
      email: user.email,
      to: user.email,
      name: user.name,
      inviteLink,
      expiresAt,
      invitingCompanyName: ctx.companyName,
    })

    await createAuditLog(ctx.userId, "UserInvite", latestInvite.id, "INVITE_RESENT", null, {
      userId: user.id,
      email: user.email,
      resendCount: latestInvite.resendCount + 1,
      emailOk: emailResult.ok,
      emailError: emailResult.error,
      skipped: emailResult.skipped,
    }, ctx.companyId)

    if (emailResult.rateLimit) {
      return NextResponse.json(
        { error: emailResult.error ?? "Resend rate limit reached" },
        { status: 429 }
      )
    }

    if (emailResult.skipped) {
      return NextResponse.json({ message: emailResult.message ?? "Invite already sent recently." })
    }

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
    if (isBuildTime) return buildGuardResponse()
    try {
      const { handleApiError } = await import("@/lib/api-response")
      return handleApiError(error)
    } catch (_) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
