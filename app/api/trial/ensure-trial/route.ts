import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/trial/ensure-trial
 * Ensures the current user's company has trial fields set (status TRIAL, subscriptionStatus trialing,
 * trialStartsAt, trialEndsAt). Use to repair companies created without these (e.g. Author Homes).
 * Idempotent: only updates when fields are missing or wrong.
 */
export async function POST() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireTenantContext } = await import("@/lib/tenant")
    const { prisma } = await import("@/lib/prisma")

    const ctx = await requireTenantContext()
    const companyId = ctx.companyId

    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        status: true,
        subscriptionStatus: true,
        trialStartsAt: true,
        trialEndsAt: true,
        createdAt: true,
      },
    })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const needsTrial =
      company.status !== "TRIAL" ||
      company.subscriptionStatus !== "trialing" ||
      company.trialStartsAt == null ||
      company.trialEndsAt == null

    if (!needsTrial) {
      return NextResponse.json({
        ok: true,
        message: "Trial fields already set",
        companyId,
        status: company.status,
        subscriptionStatus: company.subscriptionStatus,
        trialStartsAt: company.trialStartsAt,
        trialEndsAt: company.trialEndsAt,
      })
    }

    const trialStartsAt = company.trialStartsAt ?? company.createdAt ?? new Date()
    const trialEndsAt =
      company.trialEndsAt ??
      (() => {
        const end = new Date(trialStartsAt)
        end.setDate(end.getDate() + 30)
        return end
      })()

    await prisma.company.update({
      where: { id: companyId },
      data: {
        status: "TRIAL",
        subscriptionStatus: "trialing",
        trialStartsAt,
        trialEndsAt,
      },
    })

    return NextResponse.json({
      ok: true,
      message: "Trial fields set",
      companyId,
      status: "TRIAL",
      subscriptionStatus: "trialing",
      trialStartsAt,
      trialEndsAt,
    })
  } catch (error: any) {
    if (error?.message === "Unauthorized" || error?.message === "Forbidden") {
      return NextResponse.json(
        { error: error.message },
        { status: error?.message === "Unauthorized" ? 401 : 403 }
      )
    }
    console.error("POST /api/trial/ensure-trial error:", error)
    return NextResponse.json({ error: "Unable to ensure trial fields" }, { status: 500 })
  }
}
