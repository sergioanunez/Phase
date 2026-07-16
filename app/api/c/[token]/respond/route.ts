import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { loadConfirmationAccessByToken } from "@/lib/confirmation-access-token"
import { applyTaskConfirmationResponse } from "@/lib/apply-task-confirmation"
import { findAllPendingConfirmationsForPhone } from "@/lib/pending-confirmations"
import { phonesMatch } from "@/lib/phone"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["confirm", "unavailable"]),
})

/**
 * POST /api/c/[token]/respond
 * Public (no login): Confirm or mark Unavailable for one pending confirmation.
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

    const body = bodySchema.parse(await request.json())
    const pending = await findAllPendingConfirmationsForPhone(prisma, access.phoneNormalized, {
      companyId: access.companyId,
    })
    const allowed = pending.some((p) => p.taskId === body.taskId)
    if (!allowed) {
      return NextResponse.json(
        { error: "This confirmation is no longer pending or is not available." },
        { status: 404 }
      )
    }

    // Extra phone scope: ensure outbound SMS for this task went to token phone
    const outbound = await prisma.smsMessage.findFirst({
      where: {
        homeTaskId: body.taskId,
        direction: "Outbound",
        confirmationCode: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { to: true },
    })
    if (outbound && !phonesMatch(outbound.to, access.phoneNormalized)) {
      return NextResponse.json({ error: "Confirmation not found" }, { status: 404 })
    }

    const result = await applyTaskConfirmationResponse(prisma, {
      taskId: body.taskId,
      confirmed: body.action === "confirm",
      source: "MagicLink",
      expectedCompanyId: access.companyId,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode })
    }

    const remaining = await findAllPendingConfirmationsForPhone(prisma, access.phoneNormalized, {
      companyId: access.companyId,
    })

    return NextResponse.json({
      success: true,
      status: result.status,
      remainingCount: remaining.length,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    console.error("[c/respond]", error)
    return NextResponse.json({ error: "Failed to update confirmation" }, { status: 500 })
  }
}
