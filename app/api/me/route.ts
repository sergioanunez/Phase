import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

export async function GET() {
  try {
    if (isBuild()) {
      return NextResponse.json(
        {
          userId: null,
          companyId: null,
          companyName: null,
          role: null,
          contractorId: null,
        },
        { status: 200 }
      )
    }

    const { requireTenantContext } = await import("@/lib/tenant")
    const ctx = await requireTenantContext()

    return NextResponse.json({
      userId: ctx.userId,
      companyId: ctx.companyId,
      companyName: ctx.companyName ?? null,
      role: ctx.role,
      contractorId: ctx.contractorId,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
