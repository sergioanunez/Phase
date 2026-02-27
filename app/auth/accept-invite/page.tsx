"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import logoImage from "../../../public/logo.png"
import { parseAndNormalizePhone } from "@/lib/phone"

const SMS_CONSENT_LABEL =
  "I agree to receive SMS notifications from Phase related to scheduling, task confirmations, and project updates. Message frequency varies. Reply STOP to opt out. Reply HELP for help. Message & data rates may apply."

type ValidateState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "valid"; email: string; name: string; role?: string; contractorId?: string }

const isSubcontractor = (state: ValidateState) =>
  state.status === "valid" && state.role === "Subcontractor"

export default function AcceptInvitePage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [validateState, setValidateState] = useState<ValidateState>({ status: "loading" })
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [smsConsent, setSmsConsent] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const [smsConsentError, setSmsConsentError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const validateToken = useCallback(async (t: string) => {
    setValidateState({ status: "loading" })
    try {
      const res = await fetch(`/api/auth/invite/validate?token=${encodeURIComponent(t)}`)
      const data = await res.json()
      if (data.valid && data.email && data.name) {
        setValidateState({
          status: "valid",
          email: data.email,
          name: data.name,
          role: data.role,
          contractorId: data.contractorId,
        })
      } else {
        setValidateState({ status: "invalid" })
      }
    } catch {
      setValidateState({ status: "invalid" })
    }
  }, [])

  useEffect(() => {
    if (!token || token.length < 10) {
      setValidateState({ status: "invalid" })
      return
    }
    validateToken(token)
  }, [token, validateToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setPhoneError("")
    setSmsConsentError("")
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }
    const sub = isSubcontractor(validateState)
    if (sub) {
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
        setError("You must agree to the Terms & Conditions.")
        return
      }
    }
    if (!token) return
    setLoading(true)
    try {
      const body: { token: string; password: string; phone?: string; smsConsent?: boolean } = {
        token,
        password,
      }
      if (sub) {
        body.phone = parseAndNormalizePhone(phone.trim())!
        body.smsConsent = true
      }
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to set password")
        setLoading(false)
        return
      }
      setSuccess(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="relative mx-auto mb-6 flex h-9 w-28 items-center justify-center sm:h-10 sm:w-32 md:h-[3.2rem] md:w-48 lg:h-[3.2rem] lg:w-52">
          <Image
            src={logoImage}
            alt="Phase"
            fill
            className="object-contain object-center"
            priority
            unoptimized
            sizes="(min-width: 1024px) 416px, (min-width: 768px) 384px, 256px"
          />
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardDescription>
              {validateState.status === "loading"
                ? "Checking invite link..."
                : validateState.status === "invalid"
                  ? "Invite link invalid or expired"
                  : success
                    ? "Password set successfully"
                    : "Set up your password"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validateState.status === "loading" && (
              <p className="text-sm text-muted-foreground">Please wait.</p>
            )}

            {validateState.status === "invalid" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This link may have expired (links are valid for 48 hours) or has already been used.
                  Contact your admin for a new invite.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/signin">Go to sign in</Link>
                </Button>
              </div>
            )}

            {validateState.status === "valid" && !success && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <p className="font-medium text-foreground">{validateState.name}</p>
                  <p className="text-muted-foreground">{validateState.email}</p>
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-1">
                    New password * (min 6 characters)
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
                    Confirm password *
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="••••••••"
                  />
                </div>
                {isSubcontractor(validateState) && (
                  <>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium mb-1">
                        Mobile phone number *
                      </label>
                      <input
                        id="phone"
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
                        aria-describedby={phoneError ? "phone-error" : undefined}
                      />
                      {phoneError && (
                        <p id="phone-error" className="text-sm text-destructive mt-1" role="alert">
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
                          aria-describedby={smsConsentError ? "sms-consent-error" : undefined}
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
                        <p id="sms-consent-error" className="text-sm text-destructive" role="alert">
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
                {error && (
                  <div className="text-sm text-destructive" role="alert">{error}</div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Setting password..." : "Set password & activate account"}
                </Button>
              </form>
            )}

            {validateState.status === "valid" && success && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your account is active. Sign in with your email and the password you just set.
                </p>
                <Button asChild className="w-full">
                  <Link href="/auth/signin">Sign in</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
