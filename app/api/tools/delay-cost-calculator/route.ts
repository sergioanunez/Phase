import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { prisma } from "@/lib/prisma"
import { calculateDelayMetrics } from "@/lib/delay-cost-calculator/calculations"
import type { DelayCalculatorInputs } from "@/lib/delay-cost-calculator/types"
import { sendDelayCalculatorReport } from "@/lib/email/delayCalculatorReport"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const SOURCE = "delay-cost-calculator"

const inputsSchema = z.object({
  loanAmount: z.coerce.number().min(0).max(100_000_000),
  annualInterestRate: z.coerce.number().min(0).max(40),
  monthlyOverhead: z.coerce.number().min(0).max(10_000_000),
  monthlyHolding: z.coerce.number().min(0).max(10_000_000),
  expectedGrossProfit: z.coerce.number().min(0).max(100_000_000),
  delayDays: z.coerce.number().min(0).max(3650),
  activeHomes: z
    .union([z.coerce.number().int().min(0).max(50_000), z.null()])
    .optional()
    .transform((v) => (v == null || v === 0 ? null : v)),
})

const bodySchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  firstName: z
    .string()
    .max(120)
    .optional()
    .transform((s) => (s?.trim() ? s.trim().slice(0, 120) : undefined)),
  formVariant: z.enum(["primary", "passive"]).optional().default("primary"),
  inputs: inputsSchema,
})

function toCalculatorInputs(parsed: z.infer<typeof inputsSchema>): DelayCalculatorInputs {
  return {
    loanAmount: parsed.loanAmount,
    annualInterestRate: parsed.annualInterestRate,
    monthlyOverhead: parsed.monthlyOverhead,
    monthlyHolding: parsed.monthlyHolding,
    expectedGrossProfit: parsed.expectedGrossProfit,
    delayDays: Math.round(parsed.delayDays),
    activeHomes: parsed.activeHomes,
  }
}

/**
 * POST /api/tools/delay-cost-calculator
 *
 * Validates inputs, recomputes metrics server-side, persists lead, sends Resend email.
 *
 * Env (see lib/email/delayCalculatorReport.ts):
 * - RESEND_API_KEY, RESEND_FROM_EMAIL
 * - Optional: MARKETING_LEAD_NOTIFY_EMAIL or PHASE_LEAD_NOTIFICATION_EMAIL (internal copy)
 *
 * Rate limiting: not implemented; `sendDelayCalculatorReport` documents extension point.
 */
export async function POST(request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()

  try {
    const json = await request.json()
    const data = bodySchema.parse(json)
    const inputs = toCalculatorInputs(data.inputs)
    const metrics = calculateDelayMetrics(inputs)

    await prisma.marketingToolLead.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName ?? null,
        source: SOURCE,
        formVariant: data.formVariant,
        inputs: inputs as object,
        results: metrics as object,
      },
    })

    const emailResult = await sendDelayCalculatorReport({
      to: data.email,
      firstName: data.firstName,
      inputs,
      metrics,
      formVariant: data.formVariant,
    })

    if (!emailResult.ok) {
      console.error("[delay-cost-calculator] Resend error:", emailResult.error)
      return NextResponse.json(
        {
          success: true,
          emailSent: false,
          message:
            "We saved your request. Email could not be sent right now — check configuration or try again later.",
        },
        { status: 200 }
      )
    }

    return NextResponse.json({ success: true, emailSent: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }
    console.error("[delay-cost-calculator] POST error:", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
