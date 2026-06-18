import { z } from "zod"
import type { InviteDeliveryMethod, PrismaClient } from "@prisma/client"
import { parseAndNormalizePhone } from "@/lib/phone"
import {
  isSyntheticInviteEmail,
  syntheticInviteEmailFromPhone,
} from "@/lib/invite-email"
import {
  buildInviteLink,
  getInviteExpiresAt,
  generateInviteToken,
  hashInviteToken,
  sendInviteEmailWithIdempotency,
} from "@/lib/invite"
import { buildInviteSmsBody, sendInviteSMS } from "@/lib/twilio"

export const inviteDeliveryMethodInputSchema = z.enum(["email", "sms", "both"])

export type InviteDeliveryMethodInput = z.infer<typeof inviteDeliveryMethodInputSchema>

export function toPrismaDeliveryMethod(method: InviteDeliveryMethodInput): InviteDeliveryMethod {
  switch (method) {
    case "email":
      return "EMAIL"
    case "sms":
      return "SMS"
    case "both":
      return "BOTH"
  }
}

export function fromPrismaDeliveryMethod(method: InviteDeliveryMethod): InviteDeliveryMethodInput {
  switch (method) {
    case "EMAIL":
      return "email"
    case "SMS":
      return "sms"
    case "BOTH":
      return "both"
  }
}

const inviteContactFieldsSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    inviteDeliveryMethod: inviteDeliveryMethodInputSchema.default("email"),
  })
  .superRefine((data, ctx) => {
    const method = data.inviteDeliveryMethod
    const email = data.email?.trim() ?? ""
    const phone = data.phone?.trim() ?? ""

    if ((method === "email" || method === "both") && !email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email address is required when sending by email.",
        path: ["email"],
      })
    }
    if (email && !z.string().email().safeParse(email).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid email address.",
        path: ["email"],
      })
    }
    if ((method === "sms" || method === "both") && !phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a mobile phone number to send this invite by SMS.",
        path: ["phone"],
      })
    }
    if (phone && !parseAndNormalizePhone(phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid mobile phone number.",
        path: ["phone"],
      })
    }
  })

export const staffInviteSchema = inviteContactFieldsSchema.extend({
  role: z.enum(["Admin", "Superintendent", "Manager"]),
})

export const subcontractorInviteSchema = inviteContactFieldsSchema.extend({
  contractorId: z.string().min(1),
})

export const vendorContactInviteSchema = inviteContactFieldsSchema

export type ParsedInviteInput = {
  name: string
  email: string | null
  phoneE164: string | null
  inviteDeliveryMethod: InviteDeliveryMethodInput
}

export function parseStaffInviteInput(body: unknown): ParsedInviteInput & { role: "Admin" | "Superintendent" | "Manager" } {
  const data = staffInviteSchema.parse(body)
  return normalizeInviteInput(data)
}

export function parseSubcontractorInviteInput(
  body: unknown
): ParsedInviteInput & { contractorId: string } {
  const data = subcontractorInviteSchema.parse(body)
  return { ...normalizeInviteInput(data), contractorId: data.contractorId }
}

export function parseVendorContactInviteInput(body: unknown): ParsedInviteInput {
  return normalizeInviteInput(vendorContactInviteSchema.parse(body))
}

function normalizeInviteInput(data: {
  name: string
  email?: string
  phone?: string
  inviteDeliveryMethod: InviteDeliveryMethodInput
}): ParsedInviteInput {
  const method = data.inviteDeliveryMethod
  const emailRaw = data.email?.trim().toLowerCase() ?? ""
  const phoneE164 = data.phone?.trim() ? parseAndNormalizePhone(data.phone.trim()) : null

  let email: string | null = null
  if (method === "email" || method === "both") {
    email = emailRaw
  } else if (method === "sms" && phoneE164) {
    email = syntheticInviteEmailFromPhone(phoneE164)
  }

  return {
    name: data.name.trim(),
    email,
    phoneE164,
    inviteDeliveryMethod: method,
  }
}

export type DeliverInviteNotificationsParams = {
  prisma: PrismaClient
  companyId: string | null
  userId: string
  userInviteId: string
  name: string
  email: string
  phoneE164: string | null
  roleLabel: string
  inviteLink: string
  expiresAt: Date
  invitingCompanyName?: string
  deliveryMethod: InviteDeliveryMethodInput
  idempotencyKeyBase: string
}

export type DeliverInviteNotificationsResult = {
  emailOk: boolean | null
  smsOk: boolean | null
  emailError?: string
  smsError?: string
  emailSkipped?: boolean
  warning?: string
}

export async function deliverInviteNotifications(
  params: DeliverInviteNotificationsParams
): Promise<DeliverInviteNotificationsResult> {
  const {
    prisma,
    companyId,
    userId,
    userInviteId,
    name,
    email,
    phoneE164,
    roleLabel,
    inviteLink,
    expiresAt,
    invitingCompanyName,
    deliveryMethod,
    idempotencyKeyBase,
  } = params

  const sendEmail = deliveryMethod === "email" || deliveryMethod === "both"
  const sendSms = deliveryMethod === "sms" || deliveryMethod === "both"
  const now = new Date()

  let emailOk: boolean | null = null
  let smsOk: boolean | null = null
  let emailError: string | undefined
  let smsError: string | undefined
  let emailSkipped = false

  if (sendEmail && !isSyntheticInviteEmail(email)) {
    const emailResult = await sendInviteEmailWithIdempotency(prisma, {
      idempotencyKey: `${idempotencyKeyBase}:email`,
      companyId,
      userId,
      email,
      to: email,
      name,
      inviteLink,
      expiresAt,
      invitingCompanyName,
    })
    emailOk = emailResult.ok
    emailError = emailResult.error
    emailSkipped = !!emailResult.skipped
    if (emailResult.ok) {
      await prisma.userInvite.update({
        where: { id: userInviteId },
        data: { emailSentAt: now },
      })
    }
  } else if (sendEmail && isSyntheticInviteEmail(email)) {
    emailOk = null
  }

  if (sendSms && phoneE164) {
    const smsBody = buildInviteSmsBody({
      builderName: invitingCompanyName ?? "Your builder",
      role: roleLabel,
      inviteLink,
    })
    const smsResult = await sendInviteSMS({
      toPhoneE164: phoneE164,
      body: smsBody,
      companyId,
      recipientName: name,
    })
    smsOk = smsResult.ok
    smsError = smsResult.error
    if (smsResult.ok) {
      await prisma.userInvite.update({
        where: { id: userInviteId },
        data: { smsSentAt: now },
      })
    }
  }

  const warnings: string[] = []
  if (sendEmail && emailOk === false && !emailSkipped) {
    warnings.push(`We created the invite, but the email could not be sent${emailError ? `: ${emailError}` : "."}`)
  }
  if (sendSms && smsOk === false) {
    warnings.push(`We created the invite, but the text message could not be sent${smsError ? `: ${smsError}` : "."}`)
  }

  let warning: string | undefined
  if (warnings.length === 1) {
    warning = `${warnings[0]} Share this link manually: ${inviteLink}`
  } else if (warnings.length > 1) {
    warning = `${warnings.join(" ")} Share this link manually: ${inviteLink}`
  }

  return {
    emailOk,
    smsOk,
    emailError,
    smsError,
    emailSkipped,
    warning,
  }
}

export async function findUserByEmailOrPhone(
  prisma: PrismaClient,
  params: { email?: string | null; phoneE164?: string | null; companyId?: string | null }
) {
  if (params.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: params.email } })
    if (byEmail) return byEmail
  }
  if (params.phoneE164) {
    const byPhone = await prisma.user.findFirst({
      where: {
        phoneE164: params.phoneE164,
        ...(params.companyId ? { companyId: params.companyId } : {}),
      },
    })
    if (byPhone) return byPhone
  }
  return null
}

export {
  generateInviteToken,
  hashInviteToken,
  getInviteExpiresAt,
  buildInviteLink,
}
