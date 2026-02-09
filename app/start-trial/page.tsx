"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import logoImage from "../../public/logo.png"

type PlanKey = "starter" | "growth"

const PLANS: { key: PlanKey; label: string; description: string }[] = [
  { key: "starter", label: "Starter", description: "Up to 5 active homes" },
  { key: "growth", label: "Growth", description: "Up to 25 active homes" },
]

export default function StartTrialPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState("")
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("starter")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
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
          }),
        })
        const signupData = await signupRes.json()
        if (!signupRes.ok) {
          setError(signupData.error ?? "Sign up failed")
          setLoading(false)
          return
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
          selectedPlan,
        }),
      })
      const provisionData = await provisionRes.json()
      if (!provisionRes.ok) {
        setError(provisionData.error ?? "Provisioning failed. Please try again.")
        setLoading(false)
        return
      }
      router.push(provisionData.redirectTo ?? "/homes")
      router.refresh()
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

              <div>
                <span className="block text-sm font-medium mb-2">Plan</span>
                <div className="grid grid-cols-2 gap-2">
                  {PLANS.map((plan) => (
                    <button
                      key={plan.key}
                      type="button"
                      onClick={() => setSelectedPlan(plan.key)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selectedPlan === plan.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="font-medium">{plan.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                    </button>
                  ))}
                </div>
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
                </>
              )}

              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
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

