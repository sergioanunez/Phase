import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  contractorDirectoryId: z.string().min(1),
  trade: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()

    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { normalizeEmail, normalizePhone } = await import("@/lib/identity/normalize")
    const { sendSubcontractorLinkedEmail } = await import("@/lib/email/subcontractorLinked")
    const { createAuditLog } = await import("@/lib/audit")
    const {
      generateInviteToken,
      hashInviteToken,
      getInviteExpiresAt,
      buildInviteLink,
      sendInviteEmailWithIdempotency,
    } = await import("@/lib/invite")
    const { getBaseUrl, ensureAbsoluteInviteUrl } = await import("@/lib/url")
    const { canCreateUser } = await import("@/lib/entitlements")

    const ctx = await requireTenantPermission("contractors:write")
    if (ctx.role !== "Admin" && ctx.role !== "Manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const json = await req.json()
    const data = bodySchema.parse(json)

    const directory = await prisma.contractorDirectory.findUnique({
      where: { id: data.contractorDirectoryId },
    })
    if (!directory) {
      return NextResponse.json({ error: "Contractor not found" }, { status: 404 })
    }

    // Ensure normalized fields are populated
    const normalizedEmail = directory.normalizedEmail ?? normalizeEmail(directory.email)
    const normalizedPhone = directory.normalizedPhone ?? normalizePhone(directory.phone)

    if (!directory.normalizedEmail || !directory.normalizedPhone) {
      await prisma.contractorDirectory.update({
        where: { id: directory.id },
        data: {
          normalizedEmail,
          normalizedPhone,
        },
      })
    }

    // Create or reuse per-tenant Contractor row linked to this directory
    let contractor = await prisma.contractor.findFirst({
      where: {
        companyId: ctx.companyId,
        contractorDirectoryId: directory.id,
      },
    })

    if (!contractor) {
      contractor = await prisma.contractor.create({
        data: {
          companyId: ctx.companyId,
          companyName: directory.companyName || directory.displayName,
          contactName: directory.displayName,
          phone: directory.phone || "",
          email: directory.email,
          trade: data.trade ?? undefined,
          active: true,
          contractorDirectoryId: directory.id,
        },
      })
    } else if (data.trade) {
      // Optionally update trade on existing contractor
      await prisma.contractor.update({
        where: { id: contractor.id },
        data: { trade: data.trade },
      })
    }

    // Try to locate an existing user account by email or phone
    let user = null as Awaited<ReturnType<typeof prisma.user.findFirst>> | null
    if (normalizedEmail) {
      user = await prisma.user.findFirst({
        where: { email: normalizedEmail },
      })
    }
    if (!user && normalizedPhone) {
      user = await prisma.user.findFirst({
        where: {
          phoneE164: {
            contains: normalizedPhone,
          },
        },
      })
    }

    if (user) {
      // Ensure membership for this tenant as subcontractor
      const membership = await prisma.companyMembership.findFirst({
        where: {
          companyId: ctx.companyId!,
          userId: user.id,
        },
      })

      if (!membership) {
        await prisma.companyMembership.create({
          data: {
            companyId: ctx.companyId!,
            userId: user.id,
            role: "Subcontractor",
            contractorId: contractor.id,
            contractorDirectoryId: directory.id,
          },
        })
      } else {
        await prisma.companyMembership.update({
          where: { id: membership.id },
          data: {
            role: "Subcontractor",
            contractorId: contractor.id,
            contractorDirectoryId: directory.id,
          },
        })
      }

      if (user.companyId === ctx.companyId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            contractorId: contractor.id,
            role: "Subcontractor",
          },
        })
      }

      // Fire-and-forget email; don't block response on failures
      if (user.email) {
        sendSubcontractorLinkedEmail({
          to: user.email,
          name: user.name,
          tenantName: ctx.companyName ?? "a builder",
          appUrl: process.env.APP_URL || "",
        }).catch((err) => {
          console.warn("sendSubcontractorLinkedEmail failed:", err)
        })
      }

      return NextResponse.json({
        ok: true,
        mode: "linked-existing-user",
        contractorId: contractor.id,
        userId: user.id,
      })
    }

    // No existing user; automatically create invite when we have an email
    if (!directory.email) {
      return NextResponse.json({
        ok: true,
        mode: "no-user-found",
        contractorId: contractor.id,
        contractorDirectoryId: directory.id,
      })
    }

    const canCreate = await canCreateUser(prisma, ctx.companyId!)
    if (!canCreate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          mode: "invite-blocked",
          error: canCreate.error,
          upgradeHint: canCreate.upgradeHint ?? "/admin/billing",
        },
        { status: 403 }
      )
    }

    const emailLower = directory.email.trim().toLowerCase()

    const existingUserWithEmail = await prisma.user.findUnique({
      where: { email: emailLower },
    })
    if (existingUserWithEmail) {
      // Safety: do not auto-invite if a user with this email already exists.
      return NextResponse.json(
        {
          ok: false,
          mode: "email-already-in-use",
          error: "A user with this email already exists",
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
        name: directory.displayName,
        email: emailLower,
        passwordHash: null,
        role: "Subcontractor",
        status: "INVITED",
        contractorId: contractor.id,
        isActive: true,
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

    const inviteLink = ensureAbsoluteInviteUrl(buildInviteLink(getBaseUrl(), token))
    const idempotencyKey = `invite:${ctx.companyId ?? ""}:${newUser.id}`

    const emailResult = await sendInviteEmailWithIdempotency(prisma, {
      idempotencyKey,
      companyId: ctx.companyId,
      userId: newUser.id,
      email: emailLower,
      to: emailLower,
      name: directory.displayName,
      inviteLink,
      expiresAt,
      invitingCompanyName: ctx.companyName,
    })

    if (emailResult.rateLimit || !emailResult.ok) {
      await createAuditLog(
        ctx.userId,
        "UserInvite",
        userInvite.id,
        "INVITE_SENT",
        null,
        {
          userId: newUser.id,
          email: emailLower,
          emailError: emailResult.error,
        },
        ctx.companyId
      )
      return NextResponse.json(
        {
          ok: false,
          mode: "invite-email-failed",
          warning:
            emailResult.error ??
            "User created but invite email could not be sent. Share the invite link manually.",
          inviteLink,
        },
        { status: emailResult.rateLimit ? 429 : 201 }
      )
    }

    await createAuditLog(
      ctx.userId,
      "UserInvite",
      userInvite.id,
      "INVITE_SENT",
      null,
      {
        userId: newUser.id,
        email: emailLower,
      },
      ctx.companyId
    )

    return NextResponse.json({
      ok: true,
      mode: "invited-new-user",
      contractorId: contractor.id,
      userId: newUser.id,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    console.error("Subcontractor link error:", error)
    return NextResponse.json({ error: "Failed to link subcontractor" }, { status: 500 })
  }
}

