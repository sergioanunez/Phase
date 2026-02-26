import { prisma } from "./prisma"

export type SmsBlockReason = "no_phone" | "no_consent" | "opted_out"

export type CanSendSmsResult =
  | { allowed: true }
  | { allowed: false; reason: SmsBlockReason }

/**
 * Check whether we are allowed to send SMS to the contractor (compliance guard).
 * Only allowed if a user linked to this contractor has provided phone + consent and has not opted out.
 */
export async function canSendSmsByContractorId(
  contractorId: string
): Promise<CanSendSmsResult> {
  const user = await prisma.user.findFirst({
    where: { contractorId },
    select: {
      phoneE164: true,
      smsConsent: true,
      smsOptOutAt: true,
    },
  })

  if (!user) {
    return { allowed: false, reason: "no_phone" }
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

export function logSmsBlocked(
  contractorId: string,
  reason: SmsBlockReason,
  context?: { taskId?: string; action?: string }
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
