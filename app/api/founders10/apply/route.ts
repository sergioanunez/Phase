import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"
import {
  FOUNDERS10_CHALLENGE_KEY_VALUES,
  founders10ChallengeLabel,
  founders10ChallengesToLegacySummary,
  type Founders10ChallengeKey,
} from "@/lib/founders10-challenges"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const homesPerYearSchema = z.enum(["1-20", "20-50", "50-100", "100+"])

const challengeKeySchema = z.enum(
  FOUNDERS10_CHALLENGE_KEY_VALUES as [Founders10ChallengeKey, ...Founders10ChallengeKey[]]
)

const currentSystemSchema = z.enum([
  "paper",
  "excel",
  "buildertrend",
  "procore",
  "jobtread",
  "other",
])

const applyFieldsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  companyName: z.string().min(1, "Company name is required"),
  homesPerYear: homesPerYearSchema,
  challenges: z.array(challengeKeySchema).min(1, "Select at least one challenge"),
  otherChallenge: z.string().optional(),
  currentSystem: currentSystemSchema,
  systemOther: z.string().optional(),
  phone: z.string().min(1, "Phone number is required"),
  email: z.string().email("Valid email is required"),
  improvementQuestion: z.string().min(1, "Please answer the open question"),
})

const applySchema = applyFieldsSchema.superRefine((data, ctx) => {
  if (data.currentSystem === "other" && !data.systemOther?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please describe your current system",
      path: ["systemOther"],
    })
  }
})

type RawApplyBody = Record<string, unknown>

/**
 * Accepts new multi-select (`challenges` + `otherChallenge`) or legacy single-select
 * (`biggestChallenge` + `challengeOther`) and normalizes to one shape.
 */
function normalizeApplyBody(raw: RawApplyBody): RawApplyBody {
  let challenges: unknown = raw.challenges
  if (!Array.isArray(challenges) || challenges.length === 0) {
    const legacy = raw.biggestChallenge
    if (typeof legacy === "string" && legacy.length > 0) {
      challenges = [legacy]
    }
  }

  const otherChallenge =
    typeof raw.otherChallenge === "string"
      ? raw.otherChallenge
      : typeof raw.challengeOther === "string"
        ? raw.challengeOther
        : undefined

  return {
    ...raw,
    challenges,
    otherChallenge,
  }
}

/**
 * POST /api/founders10/apply
 * Captures Founders10 applications. Logs for now; extend with email/CRM/DB as needed.
 */
export async function POST(request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const body = await request.json()
    const data = applySchema.parse(normalizeApplyBody(body as RawApplyBody))

    const challengeLabels = data.challenges.map((k) => founders10ChallengeLabel(k))
    const otherChallengeText = data.challenges.includes("other")
      ? data.otherChallenge?.trim() || undefined
      : undefined

    console.info("[Founders10 Application]", {
      name: data.name,
      companyName: data.companyName,
      homesPerYear: data.homesPerYear,
      challenges: data.challenges,
      challengeLabels,
      otherChallenge: otherChallengeText,
      /** Legacy single-string fields for log parsers / CRM hooks that expect the old shape */
      biggestChallenge: founders10ChallengesToLegacySummary(data.challenges),
      challengeOther: otherChallengeText,
      currentSystem: data.currentSystem,
      systemOther: data.currentSystem === "other" ? data.systemOther?.trim() : undefined,
      phone: data.phone,
      email: data.email,
      improvementQuestion: data.improvementQuestion,
      at: new Date().toISOString(),
    })

    void import("@/lib/twilio")
      .then(({ sendFoundersApplicationSMS }) =>
        sendFoundersApplicationSMS({ name: data.name, phone: data.phone })
      )
      .then((sms) => {
        console.info("[Founders10 Application] SMS follow-up", sms)
      })
      .catch((err) => {
        console.error("[Founders10 Application] SMS follow-up error", err)
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
