import { prisma } from "@/lib/prisma"
import { parseAndNormalizePhone, phoneDigits10, phonesMatch } from "@/lib/phone"
import type { Prisma } from "@prisma/client"

export type InboundSmsReplyKind =
  | "yes"
  | "no"
  | "stop"
  | "start"
  | "help"
  | "other"

export type InboundSmsResult = {
  processed: boolean
  action?: "opt_out" | "opt_in" | "help" | "confirmed" | "declined"
  reason?: string
  taskId?: string
  replyMessage: string
}

const homeTaskInclude = {
  contractor: true,
  home: { include: { subdivision: true } },
} satisfies Prisma.HomeTaskInclude

export type HomeTaskWithConfirmContext = Prisma.HomeTaskGetPayload<{
  include: typeof homeTaskInclude
}>

/** Classify inbound SMS body for compliance vs confirmation replies. */
export function parseInboundSmsReply(body: string): InboundSmsReplyKind {
  const normalized = (body || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/[^\x20-\x7E]/g, "")
  const firstToken = normalized.split(/\s+/)[0] ?? ""

  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(firstToken)) {
    return "stop"
  }
  if (["START", "UNSTOP", "SUBSCRIBE"].includes(firstToken)) {
    return "start"
  }
  if (["HELP", "INFO"].includes(firstToken)) {
    return "help"
  }
  if (firstToken === "Y" || firstToken === "YES" || normalized.startsWith("YES")) {
    return "yes"
  }
  if (firstToken === "N" || firstToken === "NO" || normalized.startsWith("NO")) {
    return "no"
  }
  return "other"
}

export function extractConfirmationCode(body: string): string | null {
  const refMatch = body.match(/Ref:\s*(\w+)/i)
  const codeMatch = body.match(/[Cc]ode:\s*(\w+)/i)
  return refMatch ? refMatch[1].toUpperCase() : codeMatch ? codeMatch[1].toUpperCase() : null
}

export function inboundSmsReplyMessage(result: InboundSmsResult): string {
  if (result.replyMessage) return result.replyMessage
  switch (result.action) {
    case "opt_out":
      return "You have been unsubscribed from SMS notifications."
    case "opt_in":
      return "You are resubscribed to SMS notifications from Phase."
    case "help":
      return "Phase scheduling alerts: reply Y to confirm or N to decline. Reply STOP to opt out."
    case "confirmed":
      return "Thank you. Your task is confirmed."
    case "declined":
      return "Thanks. We noted you need to reschedule."
    default:
      if (result.reason === "no_pending_confirmation") {
        return "I couldn't find an open confirmation request for this phone number. Please contact your builder."
      }
      return "We couldn't process that reply. Please contact your builder if you need help."
  }
}

/** Update smsOptOutAt for any user whose phone matches (digits-based). */
export async function updateSmsOptOutByPhone(from: string, optOut: boolean): Promise<number> {
  const users = await prisma.user.findMany({
    where: { phoneE164: { not: null } },
    select: { id: true, phoneE164: true },
  })
  const ids = users
    .filter((u) => u.phoneE164 && phonesMatch(u.phoneE164, from))
    .map((u) => u.id)
  if (ids.length === 0) return 0

  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { smsOptOutAt: optOut ? new Date() : null },
  })
  return ids.length
}

/** Contractor ids whose trade/contact phone matches the sender (no app account required). */
export async function findContractorIdsBySenderPhone(from: string): Promise<string[]> {
  const digits10 = phoneDigits10(from)
  if (digits10.length !== 10) return []

  const ids = new Set<string>()

  const contactUsers = await prisma.user.findMany({
    where: { contractorId: { not: null }, phoneE164: { not: null } },
    select: { contractorId: true, phoneE164: true },
  })
  for (const user of contactUsers) {
    if (user.contractorId && user.phoneE164 && phonesMatch(user.phoneE164, from)) {
      ids.add(user.contractorId)
    }
  }

  const directories = await prisma.contractorDirectory.findMany({
    where: {
      OR: [{ normalizedPhone: { contains: digits10 } }, { phone: { contains: digits10 } }],
    },
    select: {
      contractors: { select: { id: true } },
    },
  })
  for (const directory of directories) {
    for (const contractor of directory.contractors) {
      ids.add(contractor.id)
    }
  }

  const contractors = await prisma.contractor.findMany({
    where: { phone: { contains: digits10 } },
    select: { id: true, phone: true },
  })
  for (const contractor of contractors) {
    if (phonesMatch(contractor.phone, from)) {
      ids.add(contractor.id)
    }
  }

  return Array.from(ids)
}

/** Find the most recent open confirmation for this sender phone. */
export async function findPendingConfirmationForPhone(
  from: string,
  confirmationCode: string | null
): Promise<HomeTaskWithConfirmContext | null> {
  if (confirmationCode) {
    const byCode = await prisma.homeTask.findFirst({
      where: {
        status: "PendingConfirm",
        smsMessages: {
          some: {
            confirmationCode,
            direction: "Outbound",
          },
        },
      },
      include: homeTaskInclude,
    })
    if (byCode) return byCode
  }

  const outboundMessages = await prisma.smsMessage.findMany({
    where: {
      direction: "Outbound",
      confirmationCode: { not: null },
      homeTask: { status: "PendingConfirm" },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      homeTask: { include: homeTaskInclude },
    },
  })
  for (const msg of outboundMessages) {
    if (msg.homeTask && phonesMatch(msg.to, from)) {
      return msg.homeTask
    }
  }

  const contractorIds = await findContractorIdsBySenderPhone(from)
  if (contractorIds.length > 0) {
    const byContractor = await prisma.homeTask.findFirst({
      where: {
        contractorId: { in: contractorIds },
        status: "PendingConfirm",
      },
      orderBy: { lastConfirmationAt: "desc" },
      include: homeTaskInclude,
    })
    if (byContractor) return byContractor
  }

  return null
}

export function normalizeInboundFrom(from: string): string {
  return parseAndNormalizePhone(from) ?? from
}
