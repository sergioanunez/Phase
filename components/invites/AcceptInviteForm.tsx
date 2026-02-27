"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { parseAndNormalizePhone } from "@/lib/phone"

export const SMS_CONSENT_LABEL =
  "I agree to receive SMS notifications from Phase related to scheduling, task confirmations, and project updates. Message frequency varies. Reply STOP to opt out. Reply HELP for help. Message & data rates may apply."

export type AcceptInviteFormValues = {
  password: string
  confirmPassword: string
  phone: string
  smsConsent: boolean
  termsAccepted: boolean
}

export type AcceptInviteFormProps = {
  mode: "real" | "demo"
  invitedName: string
  invitedEmail: string
  /** When true, show phone + SMS consent + Terms (subcontractor flow). In demo mode typically true. */
  showSubcontractorFields: boolean
  onSubmit: (values: AcceptInviteFormValues) => void | Promise<void>
  loading?: boolean
  success?: boolean
  successContent?: React.ReactNode
  error?: string
  submitButtonLabel?: string
  /** In demo mode, show this message after submit (e.g. 'Demo compliance page: no account is created.') */
  demoMessage?: string
  /** Optional note above the form (e.g. compliance demo disclaimer) */
  formNote?: string
}

export function AcceptInviteForm({
  mode,
  invitedName,
  invitedEmail,
  showSubcontractorFields,
  onSubmit,
  loading = false,
  success = false,
  successContent,
  error,
  submitButtonLabel = "Set password & activate account",
  demoMessage,
  formNote,
}: AcceptInviteFormProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [smsConsent, setSmsConsent] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [phoneError, setPhoneError] = useState("")
  const [smsConsentError, setSmsConsentError] = useState("")
  const [formError, setFormError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")
    setPhoneError("")
    setSmsConsentError("")

    if (password !== confirmPassword) {
      setFormError("Passwords do not match")
      return
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters")
      return
    }

    if (showSubcontractorFields) {
      const trimmed = phone.trim()
      if (!trimmed) {
        setPhoneError("Please enter a valid mobile phone number.")
        return
      }
      const phoneE164 = parseAndNormalizePhone(trimmed)
      if (!phoneE164) {
        setPhoneError("Please enter a valid mobile phone number.")
        return
      }
      if (!smsConsent) {
        setSmsConsentError("SMS consent is required to receive text notifications.")
        return
      }
      if (!termsAccepted) {
        setFormError("You must agree to the Terms & Conditions.")
        return
      }
    }

    await onSubmit({
      password,
      confirmPassword,
      phone,
      smsConsent,
      termsAccepted,
    })
  }

  const displayError = error ?? formError

  if (success && successContent) {
    return <>{successContent}</>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formNote && (
        <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
          {formNote}
        </p>
      )}
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
        <p className="font-medium text-foreground">{invitedName}</p>
        <p className="text-muted-foreground">{invitedEmail}</p>
      </div>
      <div>
        <label htmlFor="accept-invite-password" className="block text-sm font-medium mb-1">
          New password * (min 6 characters)
        </label>
        <input
          id="accept-invite-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="••••••••"
          autoComplete={mode === "demo" ? "off" : "new-password"}
        />
      </div>
      <div>
        <label htmlFor="accept-invite-confirmPassword" className="block text-sm font-medium mb-1">
          Confirm password *
        </label>
        <input
          id="accept-invite-confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="••••••••"
          autoComplete={mode === "demo" ? "off" : "new-password"}
        />
      </div>
      {showSubcontractorFields && (
        <>
          <div>
            <label htmlFor="accept-invite-phone" className="block text-sm font-medium mb-1">
              Mobile phone number *
            </label>
            <input
              id="accept-invite-phone"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setPhoneError("")
              }}
              required
              className="w-full px-3 py-2 border rounded-md"
              placeholder="(xxx) xxx-xxxx"
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? "accept-invite-phone-error" : undefined}
              autoComplete={mode === "demo" ? "off" : "tel"}
            />
            {phoneError && (
              <p id="accept-invite-phone-error" className="text-sm text-destructive mt-1" role="alert">
                {phoneError}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => {
                  setSmsConsent(e.target.checked)
                  setSmsConsentError("")
                }}
                className="mt-1 rounded border-input"
                aria-invalid={!!smsConsentError}
                aria-describedby={smsConsentError ? "accept-invite-sms-consent-error" : undefined}
              />
              <span className="text-sm">
                {SMS_CONSENT_LABEL}{" "}
                <a
                  href="/terms#sms-consent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Learn more
                </a>
              </span>
            </label>
            {smsConsentError && (
              <p id="accept-invite-sms-consent-error" className="text-sm text-destructive" role="alert">
                {smsConsentError}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 rounded border-input"
              />
              <span className="text-sm">
                I agree to the{" "}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Terms &amp; Conditions
                </Link>
                *
              </span>
            </label>
          </div>
        </>
      )}
      {displayError && (
        <div className="text-sm text-destructive" role="alert">
          {displayError}
        </div>
      )}
      {demoMessage && (
        <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2" role="status">
          {demoMessage}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Setting password..." : submitButtonLabel}
      </Button>
    </form>
  )
}
