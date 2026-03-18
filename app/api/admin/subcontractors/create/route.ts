import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  displayName: z.string().min(1),
  companyName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  trade: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()

    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { normalizeEmail, normalizePhone } = await import("@/lib/identity/normalize")

    const ctx = await requireTenantPermission("contractors:write")
    if (ctx.role !== "Admin" && ctx.role !== "Manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const json = await req.json()
    const data = bodySchema.parse(json)

    const normalizedEmail = normalizeEmail(data.email ?? undefined)
    const normalizedPhone = normalizePhone(data.phone ?? undefined)

    // Check for possible existing directory match
    if (normalizedEmail || normalizedPhone) {
      const existing = await prisma.contractorDirectory.findFirst({
        where: {
          OR: [
            normalizedEmail ? { normalizedEmail } : undefined,
            normalizedPhone ? { normalizedPhone } : undefined,
          ].filter(Boolean) as any,
        },
      })

      if (existing) {
        return NextResponse.json(
          {
            error: "Possible existing subcontractor",
            code: "POSSIBLE_MATCH",
            match: {
              contractorDirectoryId: existing.id,
              displayName: existing.displayName,
              companyName: existing.companyName,
              email: existing.email,
              phone: existing.phone,
            },
          },
          { status: 409 }
        )
      }
    }

    const directory = await prisma.contractorDirectory.create({
      data: {
        displayName: data.displayName,
        companyName: data.companyName ?? undefined,
        email: data.email ?? undefined,
        phone: data.phone ?? undefined,
        normalizedEmail,
        normalizedPhone,
      },
    })

    const contractor = await prisma.contractor.create({
      data: {
        companyId: ctx.companyId,
        companyName: data.companyName || data.displayName,
        contactName: data.displayName,
        phone: data.phone || "",
        email: data.email ?? undefined,
        trade: data.trade ?? undefined,
        active: true,
        contractorDirectoryId: directory.id,
      },
    })

    return NextResponse.json(
      {
        ok: true,
        mode: "created",
        contractorDirectoryId: directory.id,
        contractorId: contractor.id,
      },
      { status: 201 }
    )
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    console.error("Subcontractor create error:", error)
    return NextResponse.json({ error: "Failed to create subcontractor" }, { status: 500 })
  }
}

