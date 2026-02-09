import { NextRequest, NextResponse } from "next/server"
import { handleInboundSMS } from "@/lib/twilio"

// This route should be publicly accessible (no auth required)
export async function POST(request: NextRequest) {
  try {
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

    const result = await handleInboundSMS(from, to, body)

    // Twilio expects a TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for your confirmation.</Message>
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
