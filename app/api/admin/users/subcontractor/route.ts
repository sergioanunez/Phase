import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const createSubcontractorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  contractorId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const {
      generateInviteToken,
      hashInviteToken,
      getInviteExpiresAt,
      sendInviteEmail,
    } = await import("@/lib/invite")

    const ctx = await requireTenantPermission("users:write")
    const body = await request.json()
    const data = createSubcontractorSchema.parse(body)

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    })
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 400 }
      )
    }

    const contractor = await prisma.contractor.findFirst({
      where: { id: data.contractorId, companyId: ctx.companyId },
    })
    if (!contractor) {
      return NextResponse.json(
        { error: "Contractor not found" },
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
        role: "Subcontractor",
        status: "INVITED",
        contractorId: data.contractorId,
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
        email: data.email,
        tokenHash,
        expiresAt,
        createdByUserId: ctx.userId,
      },
    })

    const { getServerAppUrl } = await import("@/lib/env")
    const { buildInviteLink } = await import("@/lib/invite")
    const inviteLink = buildInviteLink(getServerAppUrl(), token)

    const emailResult = await sendInviteEmail({
      to: data.email,
      name: data.name,
      inviteLink,
      expiresAt,
      invitingCompanyName: ctx.companyName,
    })

    if (!emailResult.ok) {
      await createAuditLog(ctx.userId, "UserInvite", userInvite.id, "INVITE_SENT", null, {
        userId: newUser.id,
        email: data.email,
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
          warning: `User created but email failed: ${emailResult.error}. Share this link manually: ${inviteLink}`,
        },
        { status: 201 }
      )
    }

    await createAuditLog(ctx.userId, "UserInvite", userInvite.id, "INVITE_SENT", null, {
      userId: newUser.id,
      email: data.email,
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
    console.error("Subcontractor invite error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to create subcontractor" },
      { status: 500 }
    )
  }
}
