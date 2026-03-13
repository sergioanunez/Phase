import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { requireTenantContext } from "@/lib/tenant"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (ctx.role !== "Admin" && ctx.role !== "Manager") {
      return NextResponse.json({ onboardingCompleted: true })
    }

    const company = await prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { onboardingCompleted: true },
    })

    return NextResponse.json({
      onboardingCompleted: company?.onboardingCompleted ?? false,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (ctx.role !== "Admin" && ctx.role !== "Manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { onboardingCompleted } = body ?? {}

    if (onboardingCompleted === true) {
      await prisma.company.update({
        where: { id: ctx.companyId },
        data: { onboardingCompleted: true },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}

