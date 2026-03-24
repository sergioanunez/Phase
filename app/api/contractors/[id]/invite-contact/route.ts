import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const inviteContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

/**
 * POST /api/contractors/[id]/invite-contact
 * Create a contact (subcontractor user) linked to this vendor and send invite email.
 * Same behavior as Users panel "Add subcontractor" but invoked from Vendor detail.
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
      generateInviteToken,
      hashInviteToken,
      getInviteExpiresAt,
      buildInviteLink,
      sendInviteEmailWithIdempotency,
    } = await import("@/lib/invite")

    const ctx = await requireTenantPermission("users:write")
    const { canCreateUser } = await import("@/lib/entitlements")

    const contractor = await prisma.contractor.findFirst({
      where: { id: contractorId, companyId: ctx.companyId },
    })
    if (!contractor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 })
    }

    const body = await request.json()
    const data = inviteContactSchema.parse(body)
    const emailLower = data.email.trim().toLowerCase()

    const existing = await prisma.user.findUnique({
      where: { email: emailLower },
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
            name: data.name.trim(),
            contractorId: contractor.id,
            role: "Subcontractor",
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
        if (latestInvite && !latestInvite.usedAt) {
          await prisma.userInvite.update({
            where: { id: latestInvite.id },
            data: {
              tokenHash,
              expiresAt,
              resendCount: { increment: 1 },
            },
          })
        } else {
          await prisma.userInvite.create({
            data: {
              companyId: ctx.companyId,
              userId: existing.id,
              email: emailLower,
              tokenHash,
              expiresAt,
              createdByUserId: ctx.userId,
            },
          })
        }
        const { getBaseUrl, ensureAbsoluteInviteUrl } = await import("@/lib/url")
        const inviteLink = ensureAbsoluteInviteUrl(buildInviteLink(getBaseUrl(), token))
        const idempotencyKey = `invite:link-existing:${ctx.companyId ?? ""}:${existing.id}:${Date.now()}`
        const emailResult = await sendInviteEmailWithIdempotency(prisma, {
          idempotencyKey,
          companyId: ctx.companyId,
          userId: existing.id,
          email: emailLower,
          to: emailLower,
          name: data.name.trim(),
          inviteLink,
          expiresAt,
          invitingCompanyName: ctx.companyName,
        })
        linkMessage = emailResult.ok
          ? "Invite email sent. After they accept and opt in to SMS, confirmation texts will work for this vendor."
          : `Linked to vendor but email failed: ${emailResult.error ?? "unknown error"}. Share this link manually: ${inviteLink}`
      } else {
        const { sendSubcontractorLinkedEmail } = await import("@/lib/email/subcontractorLinked")
        if (existing.email) {
          sendSubcontractorLinkedEmail({
            to: existing.email,
            name: data.name.trim(),
            tenantName: ctx.companyName ?? "your builder",
            appUrl: process.env.NEXTAUTH_URL || process.env.APP_URL || "",
          }).catch((err) => console.warn("sendSubcontractorLinkedEmail failed:", err))
        }
      }

      await createAuditLog(ctx.userId, "Contractor", contractor.id, "UPDATE", null, {
        linkedUserId: existing.id,
        email: emailLower,
      }, ctx.companyId)

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
        name: data.name.trim(),
        email: emailLower,
        passwordHash: null,
        role: "Subcontractor",
        status: "INVITED",
        contractorId: contractor.id,
        isActive: true,
      },
      include: {
        contractor: { select: { id: true, companyName: true } },
      },
    })

    const userInvite = await prisma.userInvite.create({
      data: {
        companyId: ctx.companyId,
        userId: newUser.id,
        email: emailLower,
        tokenHash,
        expiresAt,
        createdByUserId: ctx.userId,
      },
    })

    const { getBaseUrl, ensureAbsoluteInviteUrl } = await import("@/lib/url")
    const inviteLink = ensureAbsoluteInviteUrl(buildInviteLink(getBaseUrl(), token))
    const idempotencyKey = `invite:${ctx.companyId ?? ""}:${newUser.id}`

    const emailResult = await sendInviteEmailWithIdempotency(prisma, {
      idempotencyKey,
      companyId: ctx.companyId,
      userId: newUser.id,
      email: emailLower,
      to: emailLower,
      name: data.name.trim(),
      inviteLink,
      expiresAt,
      invitingCompanyName: ctx.companyName,
    })

    if (emailResult.rateLimit) {
      await createAuditLog(ctx.userId, "UserInvite", userInvite.id, "INVITE_SENT", null, {
        userId: newUser.id,
        email: emailLower,
        emailError: emailResult.error,
      }, ctx.companyId)
      return NextResponse.json(
        { error: emailResult.error ?? "Resend rate limit reached" },
        { status: 429 }
      )
    }

    if (!emailResult.ok) {
      await createAuditLog(ctx.userId, "UserInvite", userInvite.id, "INVITE_SENT", null, {
        userId: newUser.id,
        email: emailLower,
        emailError: emailResult.error,
      }, ctx.companyId)
      return NextResponse.json(
        {
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            status: newUser.status,
            contractorId: newUser.contractorId,
            contractor: newUser.contractor,
          },
          warning: `Contact created but email failed: ${emailResult.error}. Share this link manually: ${inviteLink}`,
        },
        { status: 201 }
      )
    }

    await createAuditLog(ctx.userId, "UserInvite", userInvite.id, "INVITE_SENT", null, {
      userId: newUser.id,
      email: emailLower,
    }, ctx.companyId)

    const { passwordHash: _, ...safeUser } = newUser
    return NextResponse.json(safeUser, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 400 }
      )
    }
    if (error?.message === "Unauthorized" || error?.message === "Forbidden") {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 }
      )
    }
    console.error("Invite contact error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to invite contact" },
      { status: 500 }
    )
  }
}
