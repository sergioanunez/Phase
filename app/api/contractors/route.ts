import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const createContractorSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().nullable(),
  trade: z.string().optional().nullable(),
  preferredNoticeDays: z.number().int().positive().optional().nullable(),
  leadDays: z.number().int().min(0).max(60).optional(),
})

export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("contractors:read")

    const contractors = await prisma.contractor.findMany({
      where: { companyId: ctx.companyId, active: true },
      orderBy: { companyName: "asc" },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            phoneE164: true,
            smsConsent: true,
            smsOptOutAt: true,
          },
        },
        defaultContact: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(contractors)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { normalizeEmail, normalizePhone } = await import("@/lib/identity/normalize")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("contractors:write")
    const body = await request.json()
    const data = createContractorSchema.parse(body)

    // Ensure every new vendor also has a global ContractorDirectory identity so they
    // show up in cross-tenant Phase directory search.
    const normalizedEmail = normalizeEmail(data.email ?? undefined)
    const normalizedPhone = normalizePhone(data.phone)

    let contractorDirectoryId: string | undefined

    if (normalizedEmail || normalizedPhone) {
      const existingDirectory = await prisma.contractorDirectory.findFirst({
        where: {
          OR: [
            normalizedEmail ? { normalizedEmail } : undefined,
            normalizedPhone ? { normalizedPhone } : undefined,
          ].filter(Boolean) as any,
        },
      })

      if (existingDirectory) {
        contractorDirectoryId = existingDirectory.id
      } else {
        const newDirectory = await prisma.contractorDirectory.create({
          data: {
            displayName: data.contactName,
            companyName: data.companyName,
            email: data.email ?? undefined,
            normalizedEmail,
            phone: data.phone,
            normalizedPhone,
          },
        })
        contractorDirectoryId = newDirectory.id
      }
    }

    const contractor = await prisma.contractor.create({
      data: {
        companyId: ctx.companyId,
        companyName: data.companyName,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        trade: data.trade,
        preferredNoticeDays: data.preferredNoticeDays,
        leadDays: data.leadDays ?? 0,
        active: true,
        contractorDirectoryId,
      },
    })

    await createAuditLog(ctx.userId, "Contractor", contractor.id, "CREATE", null, contractor, ctx.companyId)

    return NextResponse.json(contractor, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
