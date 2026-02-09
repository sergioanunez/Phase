import { NextResponse } from "next/server"
import { requireTenantContext } from "@/lib/tenant"
import { handleApiError } from "@/lib/api-response"

export async function GET() {
  try {
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
