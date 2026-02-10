import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const demoRequestSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  volumePerYear: z.string().optional(),
  phone: z.string().min(1, "Contact number is required"),
  email: z.string().email("Valid email is required"),
  notes: z.string().optional(),
  plan: z.string().optional(),
})

/**
 * POST /api/contact/demo
 * Captures demo request. Stub: logs and returns success.
 * TODO: Store in DB or send to CRM/email.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = demoRequestSchema.parse(body)

    // Stub: log for now. Replace with DB insert or CRM/email integration.
    console.info("[Demo Request]", {
      companyName: data.companyName,
      volumePerYear: data.volumePerYear,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      plan: data.plan,
      at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Failed to submit demo request" },
      { status: 500 }
    )
  }
}
