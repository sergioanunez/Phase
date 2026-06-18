"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import logoImage from "../../../public/logo.png"
import { AcceptInviteForm } from "@/components/invites/AcceptInviteForm"
import { parseAndNormalizePhone } from "@/lib/phone"

type ValidateState =
  | { status: "loading" }
  | { status: "invalid" }
  | {
      status: "valid"
      email?: string
      name: string
      role?: string
      contractorId?: string
      phoneE164?: string
      requiresRealEmail?: boolean
    }

const isSubcontractor = (state: ValidateState) =>
  state.status === "valid" && state.role === "Subcontractor"

export default function AcceptInvitePage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [validateState, setValidateState] = useState<ValidateState>({ status: "loading" })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const validateToken = useCallback(async (t: string) => {
    setValidateState({ status: "loading" })
    try {
      const res = await fetch(`/api/auth/invite/validate?token=${encodeURIComponent(t)}`)
      const data = await res.json()
      if (data.valid && data.name) {
        setValidateState({
          status: "valid",
          email: data.email,
          name: data.name,
          role: data.role,
          contractorId: data.contractorId,
          phoneE164: data.phoneE164,
          requiresRealEmail: !!data.requiresRealEmail,
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

  const handleRealSubmit = async (values: {
    password: string
    confirmPassword: string
    phone: string
    smsConsent: boolean
    termsAccepted: boolean
    accountEmail?: string
  }) => {
    if (!token) return
    setError("")
    setLoading(true)
    try {
      const sub = isSubcontractor(validateState)
      const body: {
        token: string
        password: string
        phone?: string
        smsConsent?: boolean
        email?: string
      } = {
        token,
        password: values.password,
      }
      if (sub) {
        body.phone = parseAndNormalizePhone(values.phone.trim())!
        body.smsConsent = true
      }
      if (validateState.status === "valid" && validateState.requiresRealEmail && values.accountEmail) {
        body.email = values.accountEmail.trim().toLowerCase()
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
              <AcceptInviteForm
                mode="real"
                invitedName={validateState.name}
                invitedEmail={validateState.email}
                initialPhone={validateState.phoneE164}
                requiresRealEmail={validateState.requiresRealEmail}
                showSubcontractorFields={isSubcontractor(validateState)}
                onSubmit={handleRealSubmit}
                loading={loading}
                success={success}
                error={error}
                submitButtonLabel="Set password & activate account"
              />
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
