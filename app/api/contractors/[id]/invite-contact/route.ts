import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * POST /api/contractors/[id]/invite-contact
 * Create a contact (subcontractor user) linked to this vendor and send invite.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const contractorId = params.id
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const {
      parseVendorContactInviteInput,
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

    const contractor = await prisma.contractor.findFirst({
      where: { id: contractorId, companyId: ctx.companyId },
    })
    if (!contractor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 })
    }

    const data = parseVendorContactInviteInput(await request.json())
    if (!data.email) {
      return NextResponse.json({ error: "Email address is required." }, { status: 400 })
    }

    const existing = await findUserByEmailOrPhone(prisma, {
      email: data.email,
      phoneE164: data.phoneE164,
      companyId: ctx.companyId,
    })

    if (existing) {
      const staffRoles = ["Admin", "Manager", "Superintendent"] as const
      if (staffRoles.includes(existing.role as (typeof staffRoles)[number])) {
        return NextResponse.json(
          {
            error:
              "This email is already used by a builder team member. Use a different contact email for this vendor.",
          },
          { status: 400 }
        )
      }

      await prisma.companyMembership.upsert({
        where: {
          companyId_userId: { companyId: ctx.companyId!, userId: existing.id },
        },
        create: {
          companyId: ctx.companyId!,
          userId: existing.id,
          role: "Subcontractor",
          contractorId: contractor.id,
        },
        update: {
          role: "Subcontractor",
          contractorId: contractor.id,
        },
      })

      if (existing.companyId === ctx.companyId) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            contractorId: contractor.id,
            role: "Subcontractor",
            ...(data.phoneE164 ? { phoneE164: data.phoneE164 } : {}),
          },
        })
      }

      const cDefault = await prisma.contractor.findUnique({
        where: { id: contractor.id },
        select: { defaultContactId: true },
      })
      if (cDefault && !cDefault.defaultContactId) {
        await prisma.contractor.update({
          where: { id: contractor.id },
          data: { defaultContactId: existing.id },
        })
      }

      let linkMessage =
        "This contact already has a Phase account. They are linked to this vendor as the default contact. SMS still requires a saved phone number and opt-in on their account."

      const wantsInvite = !existing.passwordHash && existing.status === "INVITED"
      if (wantsInvite) {
        const token = generateInviteToken()
        const tokenHash = hashInviteToken(token)
        const expiresAt = getInviteExpiresAt()
        const latestInvite = await prisma.userInvite.findFirst({
          where: { userId: existing.id, companyId: ctx.companyId },
          orderBy: { createdAt: "desc" },
        })

        let userInviteId: string
        if (latestInvite && !latestInvite.usedAt) {
          await prisma.userInvite.update({
            where: { id: latestInvite.id },
            data: {
              tokenHash,
              expiresAt,
              resendCount: { increment: 1 },
              phoneE164: data.phoneE164 ?? latestInvite.phoneE164,
              inviteDeliveryMethod: toPrismaDeliveryMethod(data.inviteDeliveryMethod),
            },
          })
          userInviteId = latestInvite.id
        } else {
          const created = await prisma.userInvite.create({
            data: {
              companyId: ctx.companyId,
              userId: existing.id,
              email: data.email,
              phoneE164: data.phoneE164,
              inviteDeliveryMethod: toPrismaDeliveryMethod(data.inviteDeliveryMethod),
              tokenHash,
              expiresAt,
              createdByUserId: ctx.userId,
            },
          })
          userInviteId = created.id
        }

        const { getBaseUrl, ensureAbsoluteInviteUrl } = await import("@/lib/url")
        const inviteLink = ensureAbsoluteInviteUrl(buildInviteLink(getBaseUrl(), token))

        const delivery = await deliverInviteNotifications({
          prisma,
          companyId: ctx.companyId,
          userId: existing.id,
          userInviteId,
          name: data.name,
          email: data.email,
          phoneE164: data.phoneE164 ?? existing.phoneE164,
          roleLabel: "Contact",
          inviteLink,
          expiresAt,
          invitingCompanyName: ctx.companyName,
          deliveryMethod: data.inviteDeliveryMethod,
          idempotencyKeyBase: `invite:link-existing:${ctx.companyId ?? ""}:${existing.id}:${Date.now()}`,
        })

        linkMessage = delivery.warning
          ? delivery.warning
          : data.inviteDeliveryMethod === "sms"
            ? "Invite text sent. After they accept and opt in to SMS, confirmation texts will work for this vendor."
            : data.inviteDeliveryMethod === "both"
              ? "Invite email and text sent. After they accept and opt in to SMS, confirmation texts will work for this vendor."
              : "Invite email sent. After they accept and opt in to SMS, confirmation texts will work for this vendor."
      } else {
        const { sendSubcontractorLinkedEmail } = await import("@/lib/email/subcontractorLinked")
        const { isSyntheticInviteEmail } = await import("@/lib/invite-email")
        if (existing.email && !isSyntheticInviteEmail(existing.email)) {
          sendSubcontractorLinkedEmail({
            to: existing.email,
            name: data.name,
            tenantName: ctx.companyName ?? "your builder",
            appUrl: process.env.NEXTAUTH_URL || process.env.APP_URL || "",
          }).catch((err) => console.warn("sendSubcontractorLinkedEmail failed:", err))
        }
      }

      await createAuditLog(
        ctx.userId,
        "Contractor",
        contractor.id,
        "UPDATE",
        null,
        { linkedUserId: existing.id, email: data.email, phoneE164: data.phoneE164 },
        ctx.companyId
      )

      const updatedUser = await prisma.user.findUnique({
        where: { id: existing.id },
        include: { contractor: { select: { id: true, companyName: true } } },
      })
      if (!updatedUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      const { passwordHash: _, ...safeUser } = updatedUser
      return NextResponse.json(
        { ...safeUser, linkedExisting: true, message: linkMessage },
        { status: 200 }
      )
    }

    const createResult = await canCreateUser(prisma, ctx.companyId!)
    if (!createResult.allowed) {
      return NextResponse.json(
        { error: createResult.error, upgradeHint: createResult.upgradeHint ?? "/admin/billing" },
        { status: 403 }
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
        role: "Subcontractor",
        status: "INVITED",
        contractorId: contractor.id,
        isActive: true,
        ...(data.phoneE164 ? { phoneE164: data.phoneE164 } : {}),
      },
      include: {
        contractor: { select: { id: true, companyName: true } },
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
      roleLabel: "Contact",
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
    console.error("Invite contact error:", error)
    return NextResponse.json(
      { error: err?.message || "Failed to invite contact" },
      { status: 500 }
    )
  }
}
