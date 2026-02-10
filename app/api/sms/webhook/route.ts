import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

// This route should be publicly accessible (no auth required)
export async function POST(request: NextRequest) {
  try {
    if (isBuild()) {
      // During build, never touch Twilio or DB; just return a benign TwiML.
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable.</Message>
</Response>`
      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      })
    }

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

    await handleInboundSMS(from, to, body)

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
