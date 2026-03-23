import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const volumePerYearSchema = z.enum(["1-20", "20-50", "50-100", "100+"])

const biggestChallengeSchema = z.enum([
  "scheduling-subs",
  "material-delays",
  "visibility-across-homes",
  "communication",
  "other",
])

const demoRequestSchema = z
  .object({
    companyName: z.string().min(1, "Company name is required"),
    volumePerYear: volumePerYearSchema,
    phone: z.string().min(1, "Contact number is required"),
    email: z.string().email("Valid email is required"),
    biggestChallenge: biggestChallengeSchema,
    challengeOther: z.string().optional(),
    slowdownToday: z.string().optional(),
    plan: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.biggestChallenge === "other" && !data.challengeOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe your challenge",
        path: ["challengeOther"],
      })
    }
  })

/**
 * POST /api/contact/demo
 * Demo / intake request from /contact. Stub: logs and returns success.
 */
export async function POST(request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const body = await request.json()
    const data = demoRequestSchema.parse(body)

    console.info("[Demo Request]", {
      companyName: data.companyName,
      volumePerYear: data.volumePerYear,
      phone: data.phone,
      email: data.email,
      biggestChallenge: data.biggestChallenge,
      challengeOther: data.biggestChallenge === "other" ? data.challengeOther?.trim() : undefined,
      slowdownToday: data.slowdownToday,
      plan: data.plan,
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
    return NextResponse.json({ error: "Failed to submit demo request" }, { status: 500 })
  }
}
