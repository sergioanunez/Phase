import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { handleApiError } from "@/lib/api-response"
import { getSessionUserWithCompany } from "@/lib/tenant"
import { seedTrialCompany } from "@/lib/trial-seed"
import { z } from "zod"

const provisionSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200).transform((s) => s.trim()),
  selectedPlan: z.enum(["starter", "growth"]),
})

const PLAN_CONFIG = {
  starter: { pricingTier: "SMALL" as const, maxActiveHomes: 5 },
  growth: { pricingTier: "MID" as const, maxActiveHomes: 25 },
} as const

/**
 * POST /api/trial/provision
 * Idempotent trial provisioning: if user already has a company, returns it; otherwise creates
 * Company + CompanyMembership + updates User + seeds minimal data in one transaction.
 * Records TRIAL_STARTED audit log.
 */
export async function POST(request: NextRequest) {
  try {
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
    const { companyName, selectedPlan } = parsed.data
    const planConfig = PLAN_CONFIG[selectedPlan]
    const trialStartsAt = new Date()
    const trialEndsAt = new Date(trialStartsAt)
    trialEndsAt.setDate(trialEndsAt.getDate() + 30)

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName || "My Company",
          pricingTier: planConfig.pricingTier,
          maxActiveHomes: planConfig.maxActiveHomes,
          status: "TRIAL",
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
            plan: selectedPlan,
            pricingTier: planConfig.pricingTier,
            trialEndsAt: trialEndsAt.toISOString(),
          },
        },
      })

      return { companyId: company.id }
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
