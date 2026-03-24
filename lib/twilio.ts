import twilio from "twilio"
import { prisma } from "./prisma"
import { generateConfirmationCode } from "./utils"
import { TaskStatus, PricingTier } from "@prisma/client"
import { parseAndNormalizePhone } from "@/lib/phone"
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
  const taskRow = await prisma.homeTask.findUnique({
    where: { id: homeTaskId },
    select: {
      companyId: true,
      homeId: true,
    },
  })
  const { tenant, subscription } = await getSmsBrandContext(taskRow?.companyId ?? null)

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
        companyId: taskRow?.companyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        messageType: "scheduled",
        homeId: taskRow?.homeId ?? undefined,
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
        companyId: taskRow?.companyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        messageType: "scheduled",
        homeId: taskRow?.homeId ?? undefined,
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

  const taskForSender = await prisma.homeTask.findUnique({
    where: { id: homeTaskId },
    select: { companyId: true, homeId: true },
  })
  const { tenant, subscription } = await getSmsBrandContext(taskForSender?.companyId ?? null)

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
        companyId: taskForSender?.companyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        messageType: "cancelled",
        homeId: taskForSender?.homeId ?? undefined,
        homeTaskId: homeTaskId,
      },
    })
  } catch (error) {
    console.error("Failed to send cancellation SMS:", error)
    
    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        companyId: taskForSender?.companyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        messageType: "cancelled",
        homeId: taskForSender?.homeId ?? undefined,
        homeTaskId: homeTaskId,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
  }
}

/** Normalize Twilio "From" to E.164 for matching User.phoneE164 */
function inboundFromToE164(from: string): string {
  const digits = from.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return from.startsWith("+") ? from : `+${digits}`
}

/** Last 10 digits for US number comparison (handles +1XXXXXXXXXX vs XXXXXXXXXX) */
function phoneDigitsForMatch(phone: string): string {
  const d = (phone || "").replace(/\D/g, "")
  return d.length >= 10 ? d.slice(-10) : d
}

export async function handleInboundSMS(
  from: string,
  to: string,
  body: string
): Promise<{ processed: boolean; action?: string; reason?: string; taskId?: string }> {
  const normalizedFrom = from.replace(/\D/g, "")
  const normalizedTo = to.replace(/\D/g, "")
  const fromE164 = inboundFromToE164(from)

  // Handle STOP (opt-out)
  const bodyUpper = body.trim().toUpperCase()
  if (bodyUpper === "STOP" || bodyUpper === "STOPALL" || bodyUpper === "UNSUBSCRIBE") {
    const updated = await prisma.user.updateMany({
      where: { phoneE164: fromE164 },
      data: { smsOptOutAt: new Date() },
    })
    if (updated.count > 0) {
      return { processed: true, action: "opt_out" }
    }
  }

  // Store inbound SMS
  const smsMessage = await prisma.smsMessage.create({
    data: {
      direction: "Inbound",
      to: normalizedTo,
      from: normalizedFrom,
      body: body,
      status: "Received",
    },
  })

  // Try to extract confirmation/reference code (Ref: in new format, Code: legacy)
  const refMatch = body.match(/Ref:\s*(\w+)/i)
  const codeMatch = body.match(/[Cc]ode:\s*(\w+)/i)
  const confirmationCode = refMatch ? refMatch[1].toUpperCase() : codeMatch ? codeMatch[1].toUpperCase() : null
  const fromDigits10 = phoneDigitsForMatch(from)

  // Find task by confirmation code (primary method)
  let homeTask = confirmationCode
    ? await prisma.homeTask.findFirst({
        where: {
          status: "PendingConfirm",
          smsMessages: {
            some: {
              confirmationCode: confirmationCode,
              direction: "Outbound",
            },
          },
        },
        include: {
          contractor: true,
          home: {
            include: {
              subdivision: true,
            },
          },
        },
      })
    : null
  if (homeTask && process.env.NODE_ENV !== "test") {
    console.log("[sms] confirmation matched by code", { taskId: homeTask.id, from: fromDigits10 })
  }

  // Fallback 1: find PendingConfirm task whose outbound confirmation was sent TO this number (most reliable)
  if (!homeTask) {
    const recentPending = await prisma.homeTask.findMany({
      where: { status: "PendingConfirm" },
      orderBy: { lastConfirmationAt: "desc" },
      take: 50,
      include: {
        smsMessages: {
          where: { direction: "Outbound", confirmationCode: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    })
    for (const task of recentPending) {
      const outbound = task.smsMessages[0]
      if (outbound && phoneDigitsForMatch(outbound.to) === fromDigits10) {
        homeTask = await prisma.homeTask.findUnique({
          where: { id: task.id },
          include: {
            contractor: true,
            home: { include: { subdivision: true } },
          },
        })
        if (homeTask && process.env.NODE_ENV !== "test") {
          console.log("[sms] confirmation matched by outbound To", { taskId: homeTask.id, from: fromDigits10 })
        }
        break
      }
    }
  }

  // Fallback 2: find contact User by phone (digits-only match) then latest PendingConfirm for that contractor
  if (!homeTask) {
    const contractorContacts = await prisma.user.findMany({
      where: { contractorId: { not: null }, phoneE164: { not: null } },
      select: { contractorId: true, phoneE164: true },
    })
    const contactUser = contractorContacts.find(
      (u) => u.phoneE164 && phoneDigitsForMatch(u.phoneE164) === fromDigits10
    )
    if (contactUser?.contractorId) {
      homeTask = await prisma.homeTask.findFirst({
        where: {
          contractorId: contactUser.contractorId,
          status: "PendingConfirm",
        },
        orderBy: { lastConfirmationAt: "desc" },
        include: {
          contractor: true,
          home: { include: { subdivision: true } },
        },
      })
      if (homeTask && process.env.NODE_ENV !== "test") {
        console.log("[sms] confirmation matched by contact phoneE164", { taskId: homeTask.id, from: fromDigits10 })
      }
    }
    // Legacy: match by contractor office phone
    if (!homeTask) {
      const contractor = await prisma.contractor.findFirst({
        where: { phone: { contains: fromDigits10 } },
      })
      if (contractor) {
        homeTask = await prisma.homeTask.findFirst({
          where: {
            contractorId: contractor.id,
            status: "PendingConfirm",
          },
          orderBy: { lastConfirmationAt: "desc" },
          include: {
            contractor: true,
            home: { include: { subdivision: true } },
          },
        })
      }
    }
  }

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
    return { processed: false, reason: "No matching task found" }
  }

  // Link SMS to task
  await prisma.smsMessage.update({
    where: { id: smsMessage.id },
    data: { homeTaskId: homeTask.id },
  })

  // Parse response (lenient: trim, collapse whitespace, strip non-ASCII so "Y" / "YES" always recognized)
  const response = (body || "").replace(/\s+/g, " ").trim().toUpperCase().replace(/[^\x20-\x7E]/g, "")
  const isYes = response === "Y" || response.startsWith("YES")
  const isNo = response === "N" || response.startsWith("NO")

  if (isYes) {
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
      console.log("[sms] task confirmed", { taskId: homeTask.id, from: fromDigits10 })
    }
    const companyId = homeTask.companyId ?? (homeTask.home as { companyId?: string } | null)?.companyId
    if (companyId && homeTask.home) {
      const home = homeTask.home as { addressOrLot?: string }
      const { notifySmsConfirmationReceived } = await import("@/lib/notificationRules")
      await notifySmsConfirmationReceived({
        companyId,
        homeId: homeTask.homeId,
        taskId: homeTask.id,
        taskName: homeTask.nameSnapshot,
        homeLabel: home.addressOrLot ?? "Home",
        confirmed: true,
      }).catch((err) => console.error("[sms] notifySmsConfirmationReceived:", err))
    }
    return { processed: true, action: "confirmed", taskId: homeTask.id }
  } else if (isNo) {
    await prisma.homeTask.update({
      where: { id: homeTask.id },
      data: { status: "Declined" },
    })
    const companyId = homeTask.companyId ?? (homeTask.home as { companyId?: string } | null)?.companyId
    if (companyId && homeTask.home) {
      const home = homeTask.home as { addressOrLot?: string }
      const { notifySmsConfirmationReceived } = await import("@/lib/notificationRules")
      await notifySmsConfirmationReceived({
        companyId,
        homeId: homeTask.homeId,
        taskId: homeTask.id,
        taskName: homeTask.nameSnapshot,
        homeLabel: home.addressOrLot ?? "Home",
        confirmed: false,
      }).catch((err) => console.error("[sms] notifySmsConfirmationReceived:", err))
    }
    return { processed: true, action: "declined", taskId: homeTask.id }
  }

  return { processed: false, reason: "Invalid response format" }
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

  const taskForSender = await prisma.homeTask.findUnique({
    where: { id: taskId },
    select: { companyId: true, homeId: true },
  })
  const { tenant, subscription } = await getSmsBrandContext(taskForSender?.companyId ?? null)

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
        companyId: taskForSender?.companyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Sent",
        messageType: "punchlist",
        homeId: taskForSender?.homeId ?? undefined,
        homeTaskId: taskId,
      },
    })
  } catch (error) {
    console.error("Failed to send punch list SMS:", error)

    // Store failed SMS
    await prisma.smsMessage.create({
      data: {
        companyId: taskForSender?.companyId ?? undefined,
        direction: "Outbound",
        to: normalizedTo,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: message,
        status: "Failed",
        messageType: "punchlist",
        homeId: taskForSender?.homeId ?? undefined,
        homeTaskId: taskId,
      },
    })

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    throw new Error(errorCode ? `Twilio error ${errorCode}: ${errorMessage}` : errorMessage)
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
