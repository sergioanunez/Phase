import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import {
  sendTaskConfirmationInternal,
  formatSendConfirmationError,
} from "@/lib/send-task-confirmation-internal"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const user = await requirePermission("sms:send")

    const result = await sendTaskConfirmationInternal(prisma, params.id, {
      id: user.id,
      name: user.name ?? null,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          categoryBlocked: result.categoryBlocked,
          gateBlocked: result.gateBlocked,
          blockingGateName: result.blockingGateName,
          openPunchCount: result.openPunchCount,
        },
        { status: result.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Failed to send confirmation:", error)
    const { message, status } = formatSendConfirmationError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
