import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { requireTenantContext } from "@/lib/tenant"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  notifySubcontractorReply: z.boolean().optional(),
  notifyFlowAlerts: z.boolean().optional(),
  notifyPunchlist: z.boolean().optional(),
})

const BUILDERS = ["Admin", "Manager", "Superintendent"] as const

export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (!BUILDERS.includes(ctx.role as (typeof BUILDERS)[number])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { prisma } = await import("@/lib/prisma")
    const p = await prisma.userWebPushPreference.findUnique({
      where: { userId_companyId: { userId: ctx.userId, companyId: ctx.companyId } },
    })
    return NextResponse.json({
      enabled: p?.enabled ?? true,
      notifySubcontractorReply: p?.notifySubcontractorReply ?? true,
      notifyFlowAlerts: p?.notifyFlowAlerts ?? true,
      notifyPunchlist: p?.notifyPunchlist ?? true,
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (!BUILDERS.includes(ctx.role as (typeof BUILDERS)[number])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = await request.json()
    const data = patchSchema.parse(body)
    const { prisma } = await import("@/lib/prisma")

    const row = await prisma.userWebPushPreference.upsert({
      where: { userId_companyId: { userId: ctx.userId, companyId: ctx.companyId } },
      create: {
        userId: ctx.userId,
        companyId: ctx.companyId,
        enabled: data.enabled ?? true,
        notifySubcontractorReply: data.notifySubcontractorReply ?? true,
        notifyFlowAlerts: data.notifyFlowAlerts ?? true,
        notifyPunchlist: data.notifyPunchlist ?? true,
      },
      update: {
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.notifySubcontractorReply !== undefined && {
          notifySubcontractorReply: data.notifySubcontractorReply,
        }),
        ...(data.notifyFlowAlerts !== undefined && { notifyFlowAlerts: data.notifyFlowAlerts }),
        ...(data.notifyPunchlist !== undefined && { notifyPunchlist: data.notifyPunchlist }),
      },
    })

    return NextResponse.json({
      enabled: row.enabled,
      notifySubcontractorReply: row.notifySubcontractorReply,
      notifyFlowAlerts: row.notifyFlowAlerts,
      notifyPunchlist: row.notifyPunchlist,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? "Invalid body" }, { status: 400 })
    }
    return handleApiError(e)
  }
}
