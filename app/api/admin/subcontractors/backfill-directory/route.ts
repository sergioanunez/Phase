import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function POST(_req: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()

    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { normalizeEmail, normalizePhone } = await import("@/lib/identity/normalize")

    const ctx = await requireTenantPermission("contractors:write")
    // Restrict to admins/managers only; this is a maintenance endpoint.
    if (ctx.role !== "Admin" && ctx.role !== "Manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Find all active contractors for this tenant that do NOT yet have a global directory link.
    const contractors = await prisma.contractor.findMany({
      where: {
        companyId: ctx.companyId,
        contractorDirectoryId: null,
        active: true,
      },
      orderBy: { companyName: "asc" },
    })

    if (!contractors.length) {
      return NextResponse.json({
        ok: true,
        message: "No contractors without directory link for this tenant.",
        processed: 0,
        createdDirectory: 0,
        reusedDirectory: 0,
      })
    }

    let createdDirectory = 0
    let reusedDirectory = 0

    for (const contractor of contractors) {
      const normalizedEmail = normalizeEmail(contractor.email ?? undefined)
      const normalizedPhone = normalizePhone(contractor.phone)

      let directory = null as Awaited<ReturnType<typeof prisma.contractorDirectory.findFirst>> | null

      if (normalizedEmail || normalizedPhone) {
        directory = await prisma.contractorDirectory.findFirst({
          where: {
            OR: [
              normalizedEmail ? { normalizedEmail } : undefined,
              normalizedPhone ? { normalizedPhone } : undefined,
            ].filter(Boolean) as any,
          },
        })
      }

      if (!directory) {
        directory = await prisma.contractorDirectory.create({
          data: {
            displayName: contractor.contactName,
            companyName: contractor.companyName,
            email: contractor.email ?? undefined,
            normalizedEmail,
            phone: contractor.phone,
            normalizedPhone,
          },
        })
        createdDirectory += 1
      } else {
        reusedDirectory += 1
      }

      await prisma.contractor.update({
        where: { id: contractor.id },
        data: {
          contractorDirectoryId: directory.id,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      tenantId: ctx.companyId,
      processed: contractors.length,
      createdDirectory,
      reusedDirectory,
    })
  } catch (error: any) {
    console.error("Backfill contractor directory error:", error)
    return NextResponse.json({ error: "Failed to backfill contractor directory links" }, { status: 500 })
  }
}

