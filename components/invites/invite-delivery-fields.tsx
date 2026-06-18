"use client"

import type { InviteDeliveryMethodInput } from "@/lib/invite-delivery"

type InviteDeliveryFieldsProps = {
  email: string
  phone: string
  inviteDeliveryMethod: InviteDeliveryMethodInput
  onEmailChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onDeliveryMethodChange: (value: InviteDeliveryMethodInput) => void
  /** When true, default delivery method favors SMS for contacts */
  isContactRole?: boolean
}

export function InviteDeliveryFields({
  email,
  phone,
  inviteDeliveryMethod,
  onEmailChange,
  onPhoneChange,
  onDeliveryMethodChange,
  isContactRole = false,
}: InviteDeliveryFieldsProps) {
  const emailRequired = inviteDeliveryMethod === "email" || inviteDeliveryMethod === "both"
  const phoneRequired = inviteDeliveryMethod === "sms" || inviteDeliveryMethod === "both"

  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1">
          Email address{emailRequired ? " *" : ""}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required={emailRequired}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="email@example.com"
          autoComplete="email"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Mobile phone number{phoneRequired ? " *" : ""}
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          required={phoneRequired}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="e.g. 9155551234"
          autoComplete="tel"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Send invite via *</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="inviteDeliveryMethod"
              checked={inviteDeliveryMethod === "email"}
              onChange={() => onDeliveryMethodChange("email")}
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="inviteDeliveryMethod"
              checked={inviteDeliveryMethod === "sms"}
              onChange={() => onDeliveryMethodChange("sms")}
            />
            SMS
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="inviteDeliveryMethod"
              checked={inviteDeliveryMethod === "both"}
              onChange={() => onDeliveryMethodChange("both")}
            />
            Both
          </label>
        </div>
        {(isContactRole || inviteDeliveryMethod === "sms") && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Some subcontractors may prefer text invites.
          </p>
        )}
      </div>
    </>
  )
}

export function defaultInviteDeliveryForRole(
  role: string,
  phone: string
): InviteDeliveryMethodInput {
  if (role === "Subcontractor") {
    return phone.trim() ? "sms" : "email"
  }
  return "email"
}
