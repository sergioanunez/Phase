"use client"

import { Suspense, useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Import logo so it's bundled and always resolves (avoids broken image when public isn't served)
import logoImage from "../../../public/logo.png"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Eye, EyeOff } from "lucide-react"

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  Configuration: "Server configuration error. Please try again later.",
  AccessDenied: "Access denied.",
  Verification: "Verification failed or link expired.",
  Default: "Something went wrong. Please try again.",
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [showPassword, setShowPassword] = useState(false)

  // Show error from URL when redirected from NextAuth (e.g. after pages.error redirect)
  useEffect(() => {
    const err = searchParams.get("error")
    if (err) {
      setError(ERROR_MESSAGES[err] ?? ERROR_MESSAGES.Default)
      // Clear ?error= from URL without reload
      const url = new URL(window.location.href)
      url.searchParams.delete("error")
      url.searchParams.delete("callbackUrl")
      window.history.replaceState({}, "", url.pathname + (url.search || ""))
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const tenantSlug = searchParams.get("tenant") ?? undefined

    try {
      const result = await signIn("credentials", {
        email,
        password,
        tenantSlug,
        callbackUrl: "/dashboard",
        redirect: false,
      })

      if (result?.error) {
        setFailedAttempts((n) => n + 1)
        setError(result.error === "CredentialsSignin" ? "Invalid email or password" : result.error)
      } else {
        router.push(result?.url ?? "/dashboard")
        router.refresh()
      }
    } catch (err) {
      setFailedAttempts((n) => n + 1)
      setError("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Phase logo: above card, links to landing */}
        <Link
          href="/"
          className="relative mx-auto mb-6 flex h-9 w-28 items-center justify-center sm:h-10 sm:w-32 md:h-[3.2rem] md:w-48 lg:h-[3.2rem] lg:w-52 hover:opacity-90 transition-opacity"
          aria-label="Phase home"
        >
          <Image
            src={logoImage}
            alt="Phase"
            fill
            className="object-contain object-center"
            priority
            unoptimized
            sizes="(min-width: 1024px) 416px, (min-width: 768px) 384px, 256px"
          />
        </Link>

        {/* Login Card */}
        <Card className="w-full">
          <CardHeader>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md pr-24"
                />
                {failedAttempts >= 2 && (
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="text-right">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

function SignInFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="mx-auto mb-6 h-9 w-28 sm:h-10 sm:w-32 md:h-12 md:w-48 bg-muted animate-pulse rounded" />
        <Card className="w-full">
          <CardHeader>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInForm />
    </Suspense>
  )
}
