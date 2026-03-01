import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const provisionSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200).transform((s) => s.trim()),
})

/**
 * POST /api/trial/provision
 * Idempotent trial provisioning: if user already has a company, returns it; otherwise creates
 * Company + CompanyMembership + updates User + seeds minimal data in one transaction.
 * Records TRIAL_STARTED audit log.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { getSessionUserWithCompany } = await import("@/lib/tenant")
    const { seedTrialCompany } = await import("@/lib/trial-seed")
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userWithCompany = await getSessionUserWithCompany()
    if (!userWithCompany) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (userWithCompany.companyId) {
      return NextResponse.json({
        companyId: userWithCompany.companyId,
        redirectTo: "/homes",
      })
    }

    const body = await request.json()
    const parsed = provisionSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { companyName } = parsed.data
    const trialStartsAt = new Date()
    const trialEndsAt = new Date(trialStartsAt)
    trialEndsAt.setDate(trialEndsAt.getDate() + 30)

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName || "My Company",
          pricingTier: "SMALL",
          maxActiveHomes: null,
          status: "TRIAL",
          subscriptionStatus: "trialing",
          planKey: null,
          trialStartsAt,
          trialEndsAt,
        },
      })

      await tx.companyMembership.create({
        data: {
          companyId: company.id,
          userId: userWithCompany.id,
          role: "Admin",
        },
      })

      await tx.user.update({
        where: { id: userWithCompany.id },
        data: { companyId: company.id, role: "Admin" },
      })

      await seedTrialCompany(tx, company.id, userWithCompany.id)

      await tx.auditLog.create({
        data: {
          userId: userWithCompany.id,
          companyId: company.id,
          action: "TRIAL_STARTED",
          metaJson: {
            companyName: company.name,
            trialEndsAt: trialEndsAt.toISOString(),
          },
        },
      })

      return { companyId: company.id, trialStartsAt, trialEndsAt }
    })

    // Ensure trial fields are set (self-heal if anything was missing)
    const trialStartsAt = result.trialStartsAt ?? new Date()
    const trialEndsAt =
      result.trialEndsAt ?? (() => {
        const end = new Date(trialStartsAt)
        end.setDate(end.getDate() + 30)
        return end
      })()
    await prisma.company.update({
      where: { id: result.companyId },
      data: {
        status: "TRIAL",
        subscriptionStatus: "trialing",
        trialStartsAt,
        trialEndsAt,
      },
    })

    return NextResponse.json({
      companyId: result.companyId,
      redirectTo: "/homes",
    })
  } catch (error) {
    console.error("Trial provision error:", error)
    return handleApiError(error)
  }
}
