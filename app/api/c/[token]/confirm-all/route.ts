import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { loadConfirmationAccessByToken } from "@/lib/confirmation-access-token"
import { applyConfirmAllPending } from "@/lib/apply-task-confirmation"
import { findAllPendingConfirmationsForPhone } from "@/lib/pending-confirmations"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/c/[token]/confirm-all
 * Public (no login): Confirm all pending confirmations for this token's phone/tenant.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } | Promise<{ token: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")

    const resolved = await Promise.resolve(params)
    const token = decodeURIComponent(resolved?.token?.trim() ?? "")
    if (!token) {
      return NextResponse.json({ error: "Invalid confirmation link" }, { status: 400 })
    }

    const access = await loadConfirmationAccessByToken(prisma, token)
    if (!access.ok) {
      const message =
        access.reason === "expired"
          ? "This confirmation link has expired. Please contact your builder."
          : "This confirmation link is invalid."
      return NextResponse.json({ error: message, reason: access.reason }, { status: 403 })
    }

    const pending = await findAllPendingConfirmationsForPhone(prisma, access.phoneNormalized, {
      companyId: access.companyId,
    })

    if (pending.length === 0) {
      return NextResponse.json({ success: true, confirmed: 0, remainingCount: 0 })
    }

    const result = await applyConfirmAllPending(prisma, {
      taskIds: pending.map((p) => p.taskId),
      source: "MagicLink",
      expectedCompanyId: access.companyId,
    })

    return NextResponse.json({
      success: true,
      confirmed: result.confirmed,
      failed: result.failed,
      remainingCount: 0,
    })
  } catch (error: unknown) {
    console.error("[c/confirm-all]", error)
    return NextResponse.json({ error: "Failed to confirm all" }, { status: 500 })
  }
}
