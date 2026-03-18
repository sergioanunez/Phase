import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const querySchema = z.object({
  query: z.string().min(1).max(100),
})

export async function GET(req: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()

    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { normalizeEmail, normalizePhone } = await import("@/lib/identity/normalize")
    const { maskEmail, maskPhone } = await import("@/lib/identity/mask")

    const ctx = await requireTenantPermission("contractors:read")
    // Restrict to admins/managers for global search
    if (ctx.role !== "Admin" && ctx.role !== "Manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({ query: searchParams.get("query") ?? "" })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 })
    }
    const q = parsed.data.query.trim()

    const normalizedEmail = normalizeEmail(q)
    const phoneDigits = q.replace(/\D/g, "")
    const normalizedPhone = normalizePhone(q)

    const results = await prisma.contractorDirectory.findMany({
      where: {
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          q.includes("@") ? { email: { contains: q, mode: "insensitive" } } : undefined,
          normalizedEmail ? { normalizedEmail } : undefined,
          phoneDigits.length >= 4
            ? {
                normalizedPhone: {
                  contains: phoneDigits,
                },
              }
            : undefined,
        ].filter(Boolean) as any,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    // Preload already-linked contractor ids for this tenant to avoid N+1
    const directoryIds = results.map((r) => r.id)

    const [linked, usersByEmail, usersByPhone] = await Promise.all([
      prisma.contractor.findMany({
        where: {
          companyId: ctx.companyId,
          contractorDirectoryId: { in: directoryIds },
        },
        select: { contractorDirectoryId: true },
      }),
      prisma.user.findMany({
        where: {
          email: {
            in: results
              .map((r) => r.normalizedEmail)
              .filter((e): e is string => !!e),
          },
        },
        select: { email: true },
      }),
      normalizedPhone
        ? prisma.user.findMany({
            where: {
              phoneE164: { contains: normalizedPhone },
            },
            select: { phoneE164: true },
          })
        : Promise.resolve([] as { phoneE164: string | null }[]),
    ])

    const linkedSet = new Set(linked.map((l) => l.contractorDirectoryId))
    const userEmailSet = new Set(usersByEmail.map((u) => u.email.toLowerCase()))
    const userHasAnyPhoneMatch = usersByPhone.length > 0

    const payload = results.map((r) => {
      const maskedEmail = maskEmail(r.email)
      const maskedPhone = maskPhone(r.phone)
      const alreadyLinkedToTenant = linkedSet.has(r.id)

      let hasUserAccount = false
      if (r.normalizedEmail && userEmailSet.has(r.normalizedEmail)) {
        hasUserAccount = true
      } else if (normalizedPhone && userHasAnyPhoneMatch) {
        hasUserAccount = true
      }

      return {
        contractorDirectoryId: r.id,
        displayName: r.displayName,
        companyName: r.companyName,
        maskedEmail,
        maskedPhone,
        alreadyLinkedToTenant,
        hasUserAccount,
      }
    })

    return NextResponse.json({ results: payload })
  } catch (error: any) {
    console.error("Subcontractor search error:", error)
    return NextResponse.json({ error: "Failed to search directory" }, { status: 500 })
  }
}

