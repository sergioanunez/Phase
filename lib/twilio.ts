import twilio from "twilio"
import { prisma } from "./prisma"
import { generateConfirmationCode } from "./utils"
import { TaskStatus, PricingTier } from "@prisma/client"
import { parseAndNormalizePhone } from "@/lib/phone"
import {
  extractConfirmationCode,
  findPendingConfirmationForPhone,
  inboundSmsReplyMessage,
  parseInboundSmsReply,
  updateSmsOptOutByPhone,
  type InboundSmsResult,
} from "@/lib/sms-inbound"
import {
  buildScheduledSms,
  buildCancelledSms,
  buildPunchlistSms,
  type SmsBrandTenant,
} from "./sms/templates"
import { getTenantEntitlements } from "./entitlements"
import type { WhiteLabelSubscriptionLike } from "./branding/whiteLabel"

let _client: ReturnType<typeof twilio> | null = null

function getClient(): ReturnType<typeof twilio> {
  if (_client == null) {
    const sid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim()
    const token = process.env.TWILIO_AUTH_TOKEN
    if (!sid || !token) {
      throw new Error("Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.")
    }
    if (!sid.startsWith("AC")) {
      throw new Error(
        "TWILIO_ACCOUNT_SID must be a valid Twilio Account SID (it should start with AC). Check your environment variables or Twilio console."
      )
    }
    _client = twilio(sid, token)
  }
  return _client
}

/** Default "Phase"; for WHITE_LABEL tier use company brand name. */
async function getSmsSenderName(companyId: string | null): Promise<string> {
  if (!companyId) return "Phase"
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { pricingTier: true, brandAppName: true, name: true },
  })
  if (!company) return "Phase"
  if (company.pricingTier === PricingTier.WHITE_LABEL) {
    return company.brandAppName?.trim() || company.name
  }
  return "Phase"
}

/** Resolve builder company for SMS when HomeTask.companyId may be null (use home.companyId). */
async function resolveCompanyIdForHomeTaskSms(homeTaskId: string): Promise<{
  effectiveCompanyId: string | null
  homeId: string | null
}> {
  const row = await prisma.homeTask.findUnique({
    where: { id: homeTaskId },
    select: {
      companyId: true,
      homeId: true,
      home: { select: { companyId: true } },
    },
  })
  if (!row) return { effectiveCompanyId: null, homeId: null }
  const effective = row.companyId ?? row.home?.companyId ?? null
  return { effectiveCompanyId: effective, homeId: row.homeId }
}

async function getSmsBrandContext(
  companyId: string | null
): Promise<{ tenant: SmsBrandTenant; subscription: WhiteLabelSubscriptionLike | null }> {
  if (!companyId) return { tenant: null, subscription: null }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      status: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  })
  if (!company) return { tenant: null, subscription: null }

  const entitlements = await getTenantEntitlements(prisma, company.id)
  const subscription: WhiteLabelSubscriptionLike = {
    companyStatus: company.status,
    subscriptionStatus: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    whiteLabelAddOn: entitlements.whiteLabelEnabled,
  }
  const tenant: SmsBrandTenant = {
    name: company.name,
  }
  return { tenant, subscription }
}

export type BuildConfirmationSmsParams = {
  tenantName: string
  taskName: string
  address: string
  /** Community/subdivision name. If empty or omitted, that line is omitted (no blank line). */
  community?: string | null
  /** Scheduled date in MM/dd format (e.g. "03/03"). */
  scheduledDateMmDd: string
  /** Reference code for reply matching (stored with outbound SMS). */
  refCode: string
}

/**
 * Build the confirmation request SMS body to match the target copy format.
 * Line breaks and footer are exact for compliance and reply matching.
 */
export function buildConfirmationSms(params: BuildConfirmationSmsParams): string {
  const { tenantName, taskName, address, community, scheduledDateMmDd, refCode } = params
  const communityLine = community?.trim() ? `${community.trim()}\n` : ""
  return `${tenantName} scheduled:

${taskName}
${address}
${communityLine}${scheduledDateMmDd}
Ref: ${refCode}

Y = Confirm
N = Reschedule

STOP to opt out. HELP for help.`
}

export async function sendConfirmationSMS(
  homeTaskId: string,
  to: string,
  home: string,
  task: string,
  scheduledDate: Date
): Promise<string> {
  // Validate Twilio client is configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are not configured")
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio phone number is not configured")
  }

  // Normalize phone number to E.164 format if needed
  let normalizedTo = to.replace(/\D/g, "") // Remove all non-digits
  if (!normalizedTo.startsWith("+")) {
    // If no country code, assume US (+1)
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`
    } else if (normalizedTo.length === 11 && normalizedTo.startsWith("1")) {
      normalizedTo = `+${normalizedTo}`
    } else {
      throw new Error(`Invalid phone number format: ${to}. Please use E.164 format (e.g., +1234567890)`)
    }
  }

  const confirmationCode = generateConfirmationCode()
  const { effectiveCompanyId, homeId } = await resolveCompanyIdForHomeTaskSms(homeTaskId)
  const { tenant, subscription } = await getSmsBrandContext(effectiveCompanyId)

  const message = buildScheduledSms({
    tenant,
    subscription,
    taskName: task,
    address: home,
    date: scheduledDate,
    ref: confirmationCode,
  })

  try {
    const twilioMessage = await getClient().messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizedTo,
    })

    // Store outbound SMS
    await prisma.smsMessage.create({
      data: {
        companyId: effectiveCompanyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        messageType: "scheduled",
        homeId: homeId ?? undefined,
        homeTaskId: homeTaskId,
        confirmationCode: confirmationCode,
      },
    })

    // Update task status
    await prisma.homeTask.update({
      where: { id: homeTaskId },
      data: {
        status: "PendingConfirm",
        lastConfirmationAt: new Date(),
      },
    })

    return confirmationCode
  } catch (error) {
    console.error("Failed to send SMS:", error)
    
    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        companyId: effectiveCompanyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        messageType: "scheduled",
        homeId: homeId ?? undefined,
        homeTaskId: homeTaskId,
        confirmationCode: confirmationCode,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
  }
}

export async function sendCancellationSMS(
  homeTaskId: string,
  to: string,
  home: string,
  task: string,
  scheduledDate: Date
): Promise<void> {
  // Validate Twilio client is configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are not configured")
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio phone number is not configured")
  }

  // Normalize phone number to E.164 format if needed
  let normalizedTo = to.replace(/\D/g, "") // Remove all non-digits
  if (!normalizedTo.startsWith("+")) {
    // If no country code, assume US (+1)
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`
    } else if (normalizedTo.length === 11 && normalizedTo.startsWith("1")) {
      normalizedTo = `+${normalizedTo}`
    } else {
      throw new Error(`Invalid phone number format: ${to}. Please use E.164 format (e.g., +1234567890)`)
    }
  }

  const { effectiveCompanyId, homeId } = await resolveCompanyIdForHomeTaskSms(homeTaskId)
  const { tenant, subscription } = await getSmsBrandContext(effectiveCompanyId)

  const message = buildCancelledSms({
    tenant,
    subscription,
    taskName: task,
    address: home,
    date: scheduledDate,
    ref: generateConfirmationCode(),
  })

  try {
    const twilioMessage = await getClient().messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizedTo,
    })

    // Store outbound SMS
    await prisma.smsMessage.create({
      data: {
        companyId: effectiveCompanyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        messageType: "cancelled",
        homeId: homeId ?? undefined,
        homeTaskId: homeTaskId,
      },
    })
  } catch (error) {
    console.error("Failed to send cancellation SMS:", error)
    
    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        companyId: effectiveCompanyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        messageType: "cancelled",
        homeId: homeId ?? undefined,
        homeTaskId: homeTaskId,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
  }
}

/** @deprecated Use phonesMatch from @/lib/phone */
function phoneDigitsForMatch(phone: string): string {
  const d = (phone || "").replace(/\D/g, "")
  return d.length >= 10 ? d.slice(-10) : d
}

export async function handleInboundSMS(
  from: string,
  to: string,
  body: string
): Promise<InboundSmsResult> {
  const normalizedFrom = from.replace(/\D/g, "")
  const normalizedTo = to.replace(/\D/g, "")
  const replyKind = parseInboundSmsReply(body)
  const fromDigits10 = phoneDigitsForMatch(from)

  const storeInbound = () =>
    prisma.smsMessage.create({
      data: {
        direction: "Inbound",
        to: normalizedTo,
        from: normalizedFrom,
        body,
        status: "Received",
      },
    })

  if (replyKind === "stop") {
    const optedOutUsers = await updateSmsOptOutByPhone(from, true)
    await storeInbound()
    if (process.env.NODE_ENV !== "test") {
      console.log("[sms] opt-out", { fromLast4: fromDigits10.slice(-4), usersUpdated: optedOutUsers })
    }
    return {
      processed: true,
      action: "opt_out",
      replyMessage: inboundSmsReplyMessage({ processed: true, action: "opt_out", replyMessage: "" }),
    }
  }

  if (replyKind === "start") {
    const optedInUsers = await updateSmsOptOutByPhone(from, false)
    await storeInbound()
    if (process.env.NODE_ENV !== "test") {
      console.log("[sms] opt-in recovery", { fromLast4: fromDigits10.slice(-4), usersUpdated: optedInUsers })
    }
    return {
      processed: true,
      action: "opt_in",
      replyMessage: inboundSmsReplyMessage({ processed: true, action: "opt_in", replyMessage: "" }),
    }
  }

  if (replyKind === "help") {
    await storeInbound()
    return {
      processed: true,
      action: "help",
      replyMessage: inboundSmsReplyMessage({ processed: true, action: "help", replyMessage: "" }),
    }
  }

  if (replyKind !== "yes" && replyKind !== "no") {
    await storeInbound()
    return {
      processed: false,
      reason: "not_confirmation_reply",
      replyMessage: inboundSmsReplyMessage({
        processed: false,
        reason: "not_confirmation_reply",
        replyMessage: "",
      }),
    }
  }

  const smsMessage = await storeInbound()
  const confirmationCode = extractConfirmationCode(body)
  const homeTask = await findPendingConfirmationForPhone(from, confirmationCode)

  if (!homeTask) {
    if (process.env.NODE_ENV !== "test") {
      const recentCount = await prisma.homeTask.count({ where: { status: "PendingConfirm" } })
      console.log("[sms] no matching task", {
        fromLast4: fromDigits10.slice(-4),
        bodySample: (body || "").trim().slice(0, 30),
        confirmationCode,
        pendingConfirmTaskCount: recentCount,
      })
    }
    return {
      processed: false,
      reason: "no_pending_confirmation",
      replyMessage: inboundSmsReplyMessage({
        processed: false,
        reason: "no_pending_confirmation",
        replyMessage: "",
      }),
    }
  }

  if (process.env.NODE_ENV !== "test") {
    console.log("[sms] confirmation matched", {
      taskId: homeTask.id,
      fromLast4: fromDigits10.slice(-4),
      confirmationCode,
    })
  }

  await prisma.smsMessage.update({
    where: { id: smsMessage.id },
    data: { homeTaskId: homeTask.id },
  })

  if (replyKind === "yes") {
    await prisma.homeTask.update({
      where: { id: homeTask.id },
      data: {
        status: "Confirmed",
        confirmedAt: new Date(),
        confirmedByUserId: null,
        confirmationSource: "Sms",
      },
    })
    if (process.env.NODE_ENV !== "test") {
      console.log("[sms] task confirmed", { taskId: homeTask.id, fromLast4: fromDigits10.slice(-4) })
    }
    const companyId = homeTask.companyId ?? homeTask.home?.companyId
    if (companyId && homeTask.home) {
      const { notifySmsConfirmationReceived } = await import("@/lib/notificationRules")
      await notifySmsConfirmationReceived({
        companyId,
        homeId: homeTask.homeId,
        taskId: homeTask.id,
        taskName: homeTask.nameSnapshot,
        homeLabel: homeTask.home.addressOrLot ?? "Home",
        confirmed: true,
      }).catch((err) => console.error("[sms] notifySmsConfirmationReceived:", err))
    }
    return {
      processed: true,
      action: "confirmed",
      taskId: homeTask.id,
      replyMessage: inboundSmsReplyMessage({ processed: true, action: "confirmed", replyMessage: "" }),
    }
  }

  await prisma.homeTask.update({
    where: { id: homeTask.id },
    data: { status: "Declined" },
  })
  const companyId = homeTask.companyId ?? homeTask.home?.companyId
  if (companyId && homeTask.home) {
    const { notifySmsConfirmationReceived } = await import("@/lib/notificationRules")
    await notifySmsConfirmationReceived({
      companyId,
      homeId: homeTask.homeId,
      taskId: homeTask.id,
      taskName: homeTask.nameSnapshot,
      homeLabel: homeTask.home.addressOrLot ?? "Home",
      confirmed: false,
    }).catch((err) => console.error("[sms] notifySmsConfirmationReceived:", err))
  }
  return {
    processed: true,
    action: "declined",
    taskId: homeTask.id,
    replyMessage: inboundSmsReplyMessage({ processed: true, action: "declined", replyMessage: "" }),
  }
}

export async function sendPunchListSMS(
  taskId: string,
  to: string,
  home: string,
  task: string,
  punchItems: Array<{ title: string; dueDate: string | null; photoUrls?: string[] }>,
  options?: { publicLink?: string | null }
): Promise<void> {
  // Validate Twilio client is configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are not configured")
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio phone number is not configured")
  }

  // Normalize phone number to E.164 format if needed
  let normalizedTo = to.replace(/\D/g, "") // Remove all non-digits
  if (!normalizedTo.startsWith("+")) {
    // If no country code, assume US (+1)
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`
    } else if (normalizedTo.length === 11 && normalizedTo.startsWith("1")) {
      normalizedTo = `+${normalizedTo}`
    } else {
      throw new Error(`Invalid phone number format: ${to}. Please use E.164 format (e.g., +1234567890)`)
    }
  }

  const { effectiveCompanyId, homeId } = await resolveCompanyIdForHomeTaskSms(taskId)
  const { tenant, subscription } = await getSmsBrandContext(effectiveCompanyId)

  const now = new Date()
  const dueDates = punchItems
    .map((i) => (i.dueDate ? new Date(i.dueDate) : null))
    .filter((d): d is Date => !!d)
  const earliestDue = dueDates.length > 0 ? dueDates.reduce((a, b) => (a < b ? a : b)) : null

  const message = buildPunchlistSms({
    tenant,
    subscription,
    address: home,
    date: now,
    dueDate: earliestDue,
    items: punchItems.map((item) => item.title),
    // publicLink omitted temporarily to reduce filtering (A2P 10DLC pending)
  })

  try {
    const twilioMessage = await getClient().messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizedTo,
    })

    // Store outbound SMS
    await prisma.smsMessage.create({
      data: {
        companyId: effectiveCompanyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        messageType: "punchlist",
        homeId: homeId ?? undefined,
        homeTaskId: taskId,
      },
    })
  } catch (error) {
    console.error("Failed to send punch list SMS:", error)

    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        companyId: effectiveCompanyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        messageType: "punchlist",
        homeId: homeId ?? undefined,
        homeTaskId: taskId,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
  }
}

/** Invite SMS for new user onboarding (same secure link as email invite). */
export function buildInviteSmsBody(params: {
  builderName: string
  role?: string
  inviteLink: string
}): string {
  const { builderName, role, inviteLink } = params
  const short = `${builderName} invited you to Phase. Create your account: ${inviteLink}`
  if (!role?.trim()) return short
  const withRole = `${builderName} invited you to Phase.\n\nRole: ${role}\n\nCreate your account:\n${inviteLink}`
  return withRole.length <= 320 ? withRole : short
}

export type SendInviteSmsResult = {
  ok: boolean
  error?: string
}

/**
 * Sends a user invite SMS via Twilio. Logs to SmsMessage; does not throw.
 */
export async function sendInviteSMS(params: {
  toPhoneE164: string
  body: string
  companyId: string | null
  recipientName?: string
}): Promise<SendInviteSmsResult> {
  const sid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim()
  const token = process.env.TWILIO_AUTH_TOKEN
  const fromNum = process.env.TWILIO_PHONE_NUMBER?.trim()
  if (!sid || !token || !fromNum) {
    console.error("[invite SMS] Twilio not configured")
    return { ok: false, error: "SMS is not configured on this server." }
  }

  try {
    const twilioMessage = await getClient().messages.create({
      body: params.body,
      from: fromNum,
      to: params.toPhoneE164,
    })

    try {
      await prisma.smsMessage.create({
        data: {
          companyId: params.companyId,
          direction: "Outbound",
          to: params.toPhoneE164,
          from: fromNum,
          body: params.body,
          status: "Sent",
          messageType: "general",
          recipientName: params.recipientName?.trim() || null,
        },
      })
    } catch (logErr) {
      console.error("[invite SMS] failed to persist outbound row", logErr)
    }

    console.info("[invite SMS] sent", { to: params.toPhoneE164, sid: twilioMessage.sid })
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send SMS"
    console.error("[invite SMS] Twilio send failed", err)
    try {
      await prisma.smsMessage.create({
        data: {
          companyId: params.companyId,
          direction: "Outbound",
          to: params.toPhoneE164,
          from: fromNum,
          body: params.body,
          status: "Failed",
          messageType: "general",
          recipientName: params.recipientName?.trim() || null,
        },
      })
    } catch (logErr) {
      console.error("[invite SMS] failed to persist failed row", logErr)
    }
    return { ok: false, error: message }
  }
}

/** First name for SMS greeting; null if unusable (fallback body used). */
export function extractFirstNameForFoundersSms(fullName: string): string | null {
  const trimmed = fullName.trim()
  if (!trimmed) return null
  const raw = (trimmed.split(/\s+/)[0] ?? "").replace(/[^a-zA-ZÀ-ÿ'-]/g, "")
  if (raw.length < 2 || raw.length > 40) return null
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

/** Exact Founders10 applicant acknowledgment copy (Sergio / Phase). */
export function buildFoundersApplicationSmsBody(firstName: string | null): string {
  const intro = firstName
    ? `Hi ${firstName}, this is Sergio with Phase.`
    : `Hi, this is Sergio with Phase.`
  return `${intro}

Got your Founders10 application — appreciate you taking the time.

I'll review it shortly and reach out if it looks like a fit.

— Sergio`
}

export type SendFoundersApplicationSmsResult = {
  sent: boolean
  skipped?: "invalid_phone" | "twilio_not_configured" | "twilio_error"
}

/**
 * Sends a personal acknowledgment SMS after Founders10 application.
 * Does not throw; logs errors. Submission success should not depend on this.
 */
export async function sendFoundersApplicationSMS(params: {
  name: string
  phone: string
}): Promise<SendFoundersApplicationSmsResult> {
  const e164 = parseAndNormalizePhone(params.phone)
  if (!e164) {
    console.info("[Founders10 SMS] skip: invalid or unparseable phone")
    return { sent: false, skipped: "invalid_phone" }
  }

  const sid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim()
  const token = process.env.TWILIO_AUTH_TOKEN
  const fromNum = process.env.TWILIO_PHONE_NUMBER?.trim()
  if (!sid || !token || !fromNum) {
    console.info("[Founders10 SMS] skip: Twilio not configured")
    return { sent: false, skipped: "twilio_not_configured" }
  }

  const firstName = extractFirstNameForFoundersSms(params.name)
  const body = buildFoundersApplicationSmsBody(firstName)

  try {
    const twilioMessage = await getClient().messages.create({
      body,
      from: fromNum,
      to: e164,
    })

    try {
      await prisma.smsMessage.create({
        data: {
          companyId: null,
          direction: "Outbound",
          to: e164,
          from: fromNum,
          body,
          status: "Sent",
          messageType: "general",
          recipientName: params.name.trim() || null,
        },
      })
    } catch (logErr) {
      console.error("[Founders10 SMS] failed to persist outbound row", logErr)
    }

    console.info("[Founders10 SMS] sent", { to: e164, sid: twilioMessage.sid })
    return { sent: true }
  } catch (err) {
    console.error("[Founders10 SMS] Twilio send failed", err)
    try {
      await prisma.smsMessage.create({
        data: {
          companyId: null,
          direction: "Outbound",
          to: e164,
          from: fromNum,
          body,
          status: "Failed",
          messageType: "general",
          recipientName: params.name.trim() || null,
        },
      })
    } catch (logErr) {
      console.error("[Founders10 SMS] failed to persist failed row", logErr)
    }
    return { sent: false, skipped: "twilio_error" }
  }
}
