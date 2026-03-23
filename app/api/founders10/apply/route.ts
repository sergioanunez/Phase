import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const homesPerYearSchema = z.enum(["1-20", "20-50", "50-100", "100+"])

const challengeSchema = z.enum([
  "keeping-schedules-on-track",
  "subcontractor-coordination",
  "delays-between-phases",
  "lack-of-visibility",
  "communication-across-teams",
  "other",
])

const currentSystemSchema = z.enum([
  "paper",
  "excel",
  "buildertrend",
  "procore",
  "jobtread",
  "other",
])

const readinessSchema = z.enum(["actively-looking", "exploring", "curious"])

const applySchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    companyName: z.string().min(1, "Company name is required"),
    homesPerYear: homesPerYearSchema,
    biggestChallenge: challengeSchema,
    challengeOther: z.string().optional(),
    currentSystem: currentSystemSchema,
    systemOther: z.string().optional(),
    readiness: readinessSchema,
    phone: z.string().min(1, "Phone number is required"),
    email: z.string().email("Valid email is required"),
    improvementQuestion: z.string().min(1, "Please answer the open question"),
  })
  .superRefine((data, ctx) => {
    if (data.biggestChallenge === "other" && !data.challengeOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe your challenge",
        path: ["challengeOther"],
      })
    }
    if (data.currentSystem === "other" && !data.systemOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe your current system",
        path: ["systemOther"],
      })
    }
  })

/**
 * POST /api/founders10/apply
 * Captures Founders10 applications. Logs for now; extend with email/CRM/DB as needed.
 */
export async function POST(request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const body = await request.json()
    const data = applySchema.parse(body)

    console.info("[Founders10 Application]", {
      ...data,
      challengeOther:
        data.biggestChallenge === "other" ? data.challengeOther?.trim() : undefined,
      systemOther: data.currentSystem === "other" ? data.systemOther?.trim() : undefined,
      at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 })
  }
}
