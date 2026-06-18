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
    const userId = params.id
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const {
      generateInviteToken,
      hashInviteToken,
      getInviteExpiresAt,
      buildInviteLink,
      deliverInviteNotifications,
      fromPrismaDeliveryMethod,
    } = await import("@/lib/invite-delivery")
    const { isSyntheticInviteEmail } = await import("@/lib/invite-email")

    const ctx = await requireTenantPermission("users:write")

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
      return NextResponse.json({ error: "User is not in INVITED status" }, { status: 400 })
    }

    const latestInvite = await prisma.userInvite.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
    if (!latestInvite) {
      return NextResponse.json({ error: "No invite found for this user" }, { status: 400 })
    }
    if (latestInvite.usedAt) {
      return NextResponse.json({ error: "Invite has already been used" }, { status: 400 })
    }

    const token = generateInviteToken()
    const tokenHash = hashInviteToken(token)
    const expiresAt = getInviteExpiresAt()
    const deliveryMethod = fromPrismaDeliveryMethod(latestInvite.inviteDeliveryMethod)
    const phoneE164 = latestInvite.phoneE164 ?? user.phoneE164

    await prisma.userInvite.update({
      where: { id: latestInvite.id },
      data: {
        tokenHash,
        expiresAt,
        resendCount: { increment: 1 },
      },
    })

    const { getBaseUrl, ensureAbsoluteInviteUrl } = await import("@/lib/url")
    const inviteLink = ensureAbsoluteInviteUrl(buildInviteLink(getBaseUrl(), token))

    const delivery = await deliverInviteNotifications({
      prisma,
      companyId: ctx.companyId,
      userId: user.id,
      userInviteId: latestInvite.id,
      name: user.name,
      email: user.email,
      phoneE164,
      roleLabel: user.role === "Subcontractor" ? "Contact" : user.role,
      inviteLink,
      expiresAt,
      invitingCompanyName: ctx.companyName,
      deliveryMethod,
      idempotencyKeyBase: `invite:resend:${ctx.companyId ?? ""}:${userId}:${latestInvite.id}:${Date.now()}`,
    })

    await createAuditLog(
      ctx.userId,
      "UserInvite",
      latestInvite.id,
      "INVITE_RESENT",
      null,
      {
        userId: user.id,
        email: user.email,
        phoneE164,
        inviteDeliveryMethod: deliveryMethod,
        resendCount: latestInvite.resendCount + 1,
        emailOk: delivery.emailOk,
        smsOk: delivery.smsOk,
        emailError: delivery.emailError,
        smsError: delivery.smsError,
        emailSkipped: delivery.emailSkipped,
      },
      ctx.companyId
    )

    if (delivery.emailError && delivery.emailOk === false && delivery.emailError.includes("rate limit")) {
      return NextResponse.json({ error: delivery.emailError }, { status: 429 })
    }

    if (delivery.emailSkipped && delivery.smsOk !== false) {
      return NextResponse.json({ message: "Invite already sent recently." })
    }

    if (delivery.warning) {
      return NextResponse.json({
        message: delivery.warning,
        manualLink: inviteLink,
      })
    }

    const parts: string[] = []
    if (deliveryMethod === "email" || deliveryMethod === "both") {
      if (!isSyntheticInviteEmail(user.email)) parts.push("email")
    }
    if (deliveryMethod === "sms" || deliveryMethod === "both") parts.push("SMS")

    return NextResponse.json({
      message:
        parts.length === 2
          ? "Invite email and text message sent."
          : parts[0] === "SMS"
            ? "Invite text message sent."
            : "Invite email sent.",
    })
  } catch (error: unknown) {
    if (isBuildTime) return buildGuardResponse()
    try {
      const { handleApiError } = await import("@/lib/api-response")
      return handleApiError(error)
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
