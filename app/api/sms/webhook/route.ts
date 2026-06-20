import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

// This route should be publicly accessible (no auth required)
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { handleInboundSMS } = await import("@/lib/twilio")

    const formData = await request.formData()
    const from = formData.get("From") as string
    const to = formData.get("To") as string
    const body = formData.get("Body") as string

    if (!from || !to || !body) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (process.env.NODE_ENV !== "test") {
      console.log("[sms webhook] received", { fromLast4: String(from).slice(-4), bodyLength: String(body).length })
    }

    const result = await handleInboundSMS(from, to, body)

    if (process.env.NODE_ENV !== "test") {
      console.log("[sms webhook] inbound result", {
        from: from?.slice(-4),
        processed: result.processed,
        action: result.action,
        reason: result.reason,
        taskId: result.taskId,
      })
    }

    const { inboundSmsReplyMessage } = await import("@/lib/sms-inbound")
    const message = result.replyMessage || inboundSmsReplyMessage(result)

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message}</Message>
</Response>`

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    })
  } catch (error: any) {
    console.error("Failed to handle inbound SMS:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process SMS" },
      { status: 500 }
    )
  }
}
