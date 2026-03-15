"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { SpotlightTour, type SpotlightStepId } from "./spotlight-tour"

export function OnboardingTour() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const [spotlightStep, setSpotlightStep] = useState<SpotlightStepId>("dashboard")
  const [showSpotlight, setShowSpotlight] = useState(false)
  const [loading, setLoading] = useState(true)

  const role = (session?.user as { role?: string })?.role
  const isAdminOrManager = role === "Admin" || role === "Manager"
  const forceTour = searchParams.get("tour") === "onboarding"

  useEffect(() => {
    if (status !== "authenticated") return
    if (!isAdminOrManager) {
      setLoading(false)
      return
    }
    if (forceTour) {
      setShowSpotlight(true)
      setSpotlightStep("dashboard")
      setLoading(false)
      return
    }
    setShowSpotlight(false)
    setLoading(false)
  }, [status, isAdminOrManager, forceTour])

  const completeOnboarding = async () => {
    setShowSpotlight(false)
    if (!forceTour) {
      try {
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboardingCompleted: true }),
        })
      } catch {
        // ignore
      }
    }
  }

  if (loading || !isAdminOrManager) return null
  if (!showSpotlight) return null

  return (
    <SpotlightTour
      step={spotlightStep}
      onStepChange={setSpotlightStep}
      onComplete={completeOnboarding}
      onSkip={completeOnboarding}
    />
  )
}
