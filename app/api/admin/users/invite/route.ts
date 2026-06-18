import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

function roleLabel(role: string): string {
  if (role === "Subcontractor") return "Contact"
  return role
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const {
      parseStaffInviteInput,
      generateInviteToken,
      hashInviteToken,
      getInviteExpiresAt,
      buildInviteLink,
      deliverInviteNotifications,
      findUserByEmailOrPhone,
      toPrismaDeliveryMethod,
    } = await import("@/lib/invite-delivery")

    const ctx = await requireTenantPermission("users:write")
    const { canCreateUser } = await import("@/lib/entitlements")
    const createResult = await canCreateUser(prisma, ctx.companyId!)
    if (!createResult.allowed) {
      return NextResponse.json(
        { error: createResult.error, upgradeHint: createResult.upgradeHint ?? "/admin/billing" },
        { status: 403 }
      )
    }

    const data = parseStaffInviteInput(await request.json())
    if (!data.email) {
      return NextResponse.json({ error: "Email address is required." }, { status: 400 })
    }

    const existing = await findUserByEmailOrPhone(prisma, {
      email: data.email,
      phoneE164: data.phoneE164,
      companyId: ctx.companyId,
    })
    if (existing) {
      return NextResponse.json(
        {
          error: existing.email === data.email
            ? "A user with this email already exists"
            : "A user with this mobile phone number already exists",
        },
        { status: 400 }
      )
    }

    const token = generateInviteToken()
    const tokenHash = hashInviteToken(token)
    const expiresAt = getInviteExpiresAt()

    const newUser = await prisma.user.create({
      data: {
        companyId: ctx.companyId,
        name: data.name,
        email: data.email,
        passwordHash: null,
        role: data.role,
        status: "INVITED",
        contractorId: null,
        isActive: true,
        ...(data.phoneE164 ? { phoneE164: data.phoneE164 } : {}),
      },
    })

    const userInvite = await prisma.userInvite.create({
      data: {
        companyId: ctx.companyId,
        userId: newUser.id,
        email: data.email,
        phoneE164: data.phoneE164,
        inviteDeliveryMethod: toPrismaDeliveryMethod(data.inviteDeliveryMethod),
        tokenHash,
        expiresAt,
        createdByUserId: ctx.userId,
      },
    })

    const { getBaseUrl, ensureAbsoluteInviteUrl } = await import("@/lib/url")
    const inviteLink = ensureAbsoluteInviteUrl(buildInviteLink(getBaseUrl(), token))

    const delivery = await deliverInviteNotifications({
      prisma,
      companyId: ctx.companyId,
      userId: newUser.id,
      userInviteId: userInvite.id,
      name: data.name,
      email: data.email,
      phoneE164: data.phoneE164,
      roleLabel: roleLabel(data.role),
      inviteLink,
      expiresAt,
      invitingCompanyName: ctx.companyName,
      deliveryMethod: data.inviteDeliveryMethod,
      idempotencyKeyBase: `invite:${ctx.companyId ?? ""}:${newUser.id}`,
    })

    if (delivery.emailError && delivery.emailOk === false && delivery.emailError.includes("rate limit")) {
      return NextResponse.json({ error: delivery.emailError }, { status: 429 })
    }

    await createAuditLog(
      ctx.userId,
      "UserInvite",
      userInvite.id,
      "INVITE_SENT",
      null,
      {
        userId: newUser.id,
        email: data.email,
        phoneE164: data.phoneE164,
        inviteDeliveryMethod: data.inviteDeliveryMethod,
        emailOk: delivery.emailOk,
        smsOk: delivery.smsOk,
        emailError: delivery.emailError,
        smsError: delivery.smsError,
      },
      ctx.companyId
    )

    const { passwordHash: _, ...safeUser } = newUser
    if (delivery.warning) {
      return NextResponse.json({ user: safeUser, warning: delivery.warning }, { status: 201 })
    }
    return NextResponse.json(safeUser, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }
    const err = error as { code?: string; message?: string }
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Email or phone already exists" }, { status: 400 })
    }
    if (err?.message === "Unauthorized" || err?.message === "Forbidden") {
      return NextResponse.json(
        { error: err.message },
        { status: err.message === "Unauthorized" ? 401 : 403 }
      )
    }
    console.error("User invite error:", error)
    return NextResponse.json(
      { error: err?.message || "Failed to send invite" },
      { status: 500 }
    )
  }
}
