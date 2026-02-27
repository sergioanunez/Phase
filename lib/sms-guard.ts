import { prisma } from "./prisma"

export type SmsBlockReason = "no_contact" | "no_phone" | "no_consent" | "opted_out"

export type CanSendSmsResult =
  | { allowed: true }
  | { allowed: false; reason: SmsBlockReason }

export type SmsRecipientResult =
  | { allowed: true; contactId: string; phoneE164: string }
  | { allowed: false; reason: SmsBlockReason }

/**
 * Check whether we are allowed to send SMS to a specific contact (User).
 * SMS is only sent to contacts who have opted in; vendor office phone is never used.
 */
export async function canSendSmsToContact(contactId: string): Promise<CanSendSmsResult> {
  const user = await prisma.user.findUnique({
    where: { id: contactId },
    select: {
      phoneE164: true,
      smsConsent: true,
      smsOptOutAt: true,
    },
  })

  if (!user) {
    return { allowed: false, reason: "no_contact" }
  }
  if (!user.phoneE164) {
    return { allowed: false, reason: "no_phone" }
  }
  if (!user.smsConsent) {
    return { allowed: false, reason: "no_consent" }
  }
  if (user.smsOptOutAt) {
    return { allowed: false, reason: "opted_out" }
  }

  return { allowed: true }
}

/**
 * Resolve the SMS recipient for a vendor (contractor).
 * 1) Prefer vendor.defaultContactId if set and eligible.
 * 2) Else first eligible contact (phone + consent, not opted out).
 * Never uses vendor/contractor office phone.
 */
export async function getSmsRecipientForContractor(
  contractorId: string
): Promise<SmsRecipientResult> {
  const contractor = await prisma.contractor.findUnique({
    where: { id: contractorId },
    select: {
      defaultContactId: true,
      users: {
        select: {
          id: true,
          phoneE164: true,
          smsConsent: true,
          smsOptOutAt: true,
        },
      },
    },
  })

  if (!contractor) {
    return { allowed: false, reason: "no_contact" }
  }

  const eligible = contractor.users.filter(
    (u) =>
      u.phoneE164 &&
      u.smsConsent === true &&
      u.smsOptOutAt == null
  )

  // Prefer default contact if set and eligible
  if (contractor.defaultContactId) {
    const defaultUser = contractor.users.find((u) => u.id === contractor.defaultContactId)
    if (defaultUser && defaultUser.phoneE164 && defaultUser.smsConsent && !defaultUser.smsOptOutAt) {
      return {
        allowed: true,
        contactId: defaultUser.id,
        phoneE164: defaultUser.phoneE164,
      }
    }
  }

  // Else first eligible contact
  if (eligible.length > 0) {
    return {
      allowed: true,
      contactId: eligible[0].id,
      phoneE164: eligible[0].phoneE164!,
    }
  }

  // No eligible contact
  if (contractor.users.length === 0) {
    return { allowed: false, reason: "no_contact" }
  }
  const first = contractor.users[0]
  if (!first.phoneE164) return { allowed: false, reason: "no_phone" }
  if (!first.smsConsent) return { allowed: false, reason: "no_consent" }
  if (first.smsOptOutAt) return { allowed: false, reason: "opted_out" }
  return { allowed: false, reason: "no_contact" }
}

/**
 * @deprecated Use getSmsRecipientForContractor for resolving contact + phone. Kept for compatibility.
 */
export async function canSendSmsByContractorId(
  contractorId: string
): Promise<CanSendSmsResult> {
  const result = await getSmsRecipientForContractor(contractorId)
  if (result.allowed) return { allowed: true }
  return { allowed: false, reason: result.reason }
}

export function logSmsBlocked(
  contractorId: string,
  reason: SmsBlockReason,
  context?: { taskId?: string; action?: string; contactId?: string }
): void {
  console.info(
    JSON.stringify({
      event: "sms_send_blocked",
      contractorId,
      reason,
      ...context,
    })
  )
}
