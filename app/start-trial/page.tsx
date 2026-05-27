"use client"

import { useState, useEffect } from "react"
import { signIn, getSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SMS_CONSENT_VERSION } from "@/lib/sms-consent"
import logoImage from "../../public/logo.png"

export default function StartTrialPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [smsConsent, setSmsConsent] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.companyId) {
          router.replace("/homes")
          return
        }
        setHasSession(!!data?.user)
      })
      .catch(() => setHasSession(false))
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (hasSession === false) {
        const signupRes = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            name: name.trim() || email.split("@")[0],
            termsAccepted,
            smsConsent,
            smsConsentVersion: SMS_CONSENT_VERSION,
            companyName: companyName.trim() || undefined,
            signupSource: "/start-trial",
          }),
        })
        const signupData = await signupRes.json()
        if (!signupRes.ok) {
          setError(signupData.error ?? "Sign up failed")
          setLoading(false)
          return
        }

        if (typeof window !== "undefined") {
          const anyWindow = window as any
          if (anyWindow.analytics?.track) {
            anyWindow.analytics.track("signup_sms_consent", {
              smsConsent,
              smsConsentVersion: SMS_CONSENT_VERSION,
            })
          }
        }

        const signInResult = await signIn("credentials", {
          email,
          password,
          redirect: false,
        })
        if (signInResult?.error) {
          setError("Account created but sign-in failed. Please sign in manually.")
          setLoading(false)
          return
        }
      }

      const provisionRes = await fetch("/api/trial/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim() || "My Company",
        }),
      })
      const provisionData = await provisionRes.json()
      if (!provisionRes.ok) {
        setError(provisionData.error ?? "Provisioning failed. Please try again.")
        setLoading(false)
        return
      }
      // Full-page redirect so the next request gets a fresh session (companyId from DB in session callback)
      const target = provisionData.redirectTo ?? "/homes"
      window.location.href = target
      return
    } catch (err) {
      console.error("Trial start error:", err)
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (hasSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="mx-auto mb-6 flex justify-center">
          <Image
            src={logoImage}
            alt="Phase"
            width={logoImage.width}
            height={logoImage.height}
            className="h-auto max-h-12 w-auto max-w-[180px] object-contain"
            priority
            unoptimized
          />
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Start your 30-day free trial</CardTitle>
            <CardDescription>
              Create your company and get instant access. No credit card required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="companyName" className="block text-sm font-medium mb-1">
                  Company name
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="My Company"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              {!hasSession && (
                <>
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium mb-1">
                      Your name
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-1">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium mb-1">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                    <p className="text-xs text-muted-foreground mt-1">At least 6 characters</p>
                  </div>
                <div className="flex items-start gap-2">
                  <input
                    id="smsConsent"
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    aria-describedby="sms-consent-label"
                  />
                  <div className="text-sm text-gray-700">
                    <label id="sms-consent-label" htmlFor="smsConsent">
                      I agree to receive SMS notifications related to scheduling, task confirmations, and operational
                      updates. Message frequency varies. Reply STOP to opt out. Reply HELP for help. Message &amp; data
                      rates may apply.
                    </label>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <Link
                        href="/terms#sms-consent"
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        Learn more
                      </Link>
                    </div>
                  </div>
                </div>
                  <div className="flex items-start gap-2">
                    <input
                      id="termsAccepted"
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      aria-describedby="terms-label"
                    />
                    <label id="terms-label" htmlFor="termsAccepted" className="text-sm text-gray-700">
                      I agree to the{" "}
                      <Link href="/terms" target="_self" className="text-primary underline-offset-2 hover:underline">
                        Terms &amp; Conditions
                      </Link>
                    </label>
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || (!hasSession && !termsAccepted)}
              >
                {loading ? "Setting up..." : "Start 30-day free trial"}
              </Button>
            </form>
            {!hasSession && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/auth/signin" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

