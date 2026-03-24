import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { hasPermission } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * Default for "Resend SMS" toggle when opening the reschedule sheet.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("tasks:read")

    const task = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
      },
      select: {
        contractorId: true,
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const canSendSms = hasPermission(ctx.role, "sms:send")
    let contractorEligibleForSms = false

    if (task.contractorId) {
      const { getSmsRecipientForContractor } = await import("@/lib/sms-guard")
      const recipient = await getSmsRecipientForContractor(task.contractorId)
      contractorEligibleForSms = recipient.allowed
    }

    const defaultResendSms = Boolean(canSendSms && contractorEligibleForSms)

    return NextResponse.json({
      canSendSms,
      contractorEligibleForSms,
      defaultResendSms,
    })
  } catch (error: unknown) {
    const { handleApiError } = await import("@/lib/api-response")
    return handleApiError(error)
  }
}
