"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type OnboardingStep =
  | "intro"
  | "dashboard"
  | "subdivisions"
  | "homes"
  | "template"
  | "contractors"
  | "team"
  | "flow"
  | "complete"

export function OnboardingTour() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<OnboardingStep>("intro")
  const [loading, setLoading] = useState(true)
  const [forced, setForced] = useState(false)

  const role = (session?.user as any)?.role as string | undefined
  const isAdminOrManager = role === "Admin" || role === "Manager"

  useEffect(() => {
    if (status !== "authenticated") return
    if (!isAdminOrManager) {
      setLoading(false)
      return
    }

    const forceTour = searchParams.get("tour") === "onboarding"
    setForced(forceTour)

    if (forceTour) {
      setVisible(true)
      setStep("intro")
      setLoading(false)
      return
    }

    fetch("/api/onboarding", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => {
        if (!data.onboardingCompleted) {
          setVisible(true)
          setStep("intro")
        }
      })
      .finally(() => setLoading(false))
  }, [status, isAdminOrManager, searchParams])

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        completeOnboarding()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, forced])

  const completeOnboarding = async () => {
    setVisible(false)
    if (!forced) {
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

  const goTo = (path: string) => {
    if (pathname !== path) {
      router.push(path)
    }
  }

  const nextStep = () => {
    setStep((current) => {
      const order: OnboardingStep[] = [
        "intro",
        "dashboard",
        "subdivisions",
        "homes",
        "template",
        "contractors",
        "team",
        "flow",
        "complete",
      ]
      const idx = order.indexOf(current)
      return order[Math.min(order.length - 1, idx + 1)]
    })
  }

  if (loading || !visible || !isAdminOrManager) return null

  const stepIndexMap: Record<OnboardingStep, number> = {
    intro: 0,
    dashboard: 1,
    subdivisions: 2,
    homes: 3,
    template: 4,
    contractors: 5,
    team: 6,
    flow: 7,
    complete: 8,
  }
  const totalSteps = 7
  const currentStepNumber =
    step === "intro" || step === "complete" ? undefined : stepIndexMap[step]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      aria-label="Onboarding tour"
    >
      <Card className="relative max-w-lg w-full shadow-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sky-600" />
            {step === "intro" && "Welcome to Phase"}
            {step === "dashboard" && "Dashboard"}
            {step === "subdivisions" && "Subdivisions"}
            {step === "homes" && "Homes"}
            {step === "template" && "Work Items Template"}
            {step === "contractors" && "Contractors"}
            {step === "team" && "Team Members"}
            {step === "flow" && "Flow Mode"}
            {step === "complete" && "You're ready to start"}
          </CardTitle>
          {currentStepNumber && (
            <p className="mt-1 text-xs text-muted-foreground">
              Step {currentStepNumber} of {totalSteps}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          {step === "intro" && (
            <>
              <p className="text-sm text-muted-foreground">
                Your construction field operating system.
              </p>
              <p className="text-sm text-muted-foreground">
                Phase helps you coordinate homes, contractors, and schedules in one place. Let's
                walk through the essentials so you can get your builds moving.
              </p>
            </>
          )}
          {step === "dashboard" && (
            <>
              <p className="font-medium text-sm">Dashboard</p>
              <p className="text-sm text-muted-foreground">
                This is your construction control center. See how many homes are active, which homes
                are behind schedule, where homes are in the build process, and upcoming work and
                risks.
              </p>
            </>
          )}
          {step === "subdivisions" && (
            <>
              <p className="font-medium text-sm">Subdivisions &amp; Homes</p>
              <p className="text-sm text-muted-foreground">
                Subdivisions organize your projects. Each subdivision contains multiple homes and
                their schedules, such as Paseos del Este or Mission Ridge.
              </p>
            </>
          )}
          {step === "homes" && (
            <>
              <p className="font-medium text-sm">Homes</p>
              <p className="text-sm text-muted-foreground">
                Homes are where construction actually happens. Each home contains a build schedule,
                task dependencies, inspections, punchlists, and contractor assignments.
              </p>
            </>
          )}
          {step === "template" && (
            <>
              <p className="font-medium text-sm">Work Items Template</p>
              <p className="text-sm text-muted-foreground">
                Your Work Items Template defines the build sequence. It controls task order,
                dependencies, durations, and phase grouping. Every home uses this template to
                generate its schedule.
              </p>
            </>
          )}
          {step === "contractors" && (
            <>
              <p className="font-medium text-sm">Contractors</p>
              <p className="text-sm text-muted-foreground">
                Register your subcontractors here. Contractors receive task confirmations,
                punchlists, and schedule notifications. You can also import vendors from Excel.
              </p>
            </>
          )}
          {step === "team" && (
            <>
              <p className="font-medium text-sm">Team Members</p>
              <p className="text-sm text-muted-foreground">
                Invite your superintendents and team members. They can schedule work, manage
                punchlists, and monitor homes.
              </p>
            </>
          )}
          {step === "flow" && (
            <>
              <p className="font-medium text-sm">Flow Mode</p>
              <p className="text-sm text-muted-foreground">
                Flow Mode shows what actions need to happen today to keep builds on schedule. It
                tells you what to schedule, what to order, and what is at risk—so you can run your
                day as a superintendent&apos;s command center.
              </p>
            </>
          )}
          {step === "complete" && (
            <>
              <p className="font-medium text-sm">You&apos;re ready to start building with Phase.</p>
              <p className="text-sm text-muted-foreground">
                Suggested next actions: create your first subdivision, add homes, register
                contractors, and schedule your first tasks.
              </p>
            </>
          )}

          <div className={cn("flex flex-wrap items-center justify-between gap-2 pt-2")}>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={completeOnboarding}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip tour
            </Button>
            <div className="flex flex-wrap gap-2">
              {step === "subdivisions" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goTo("/admin")}
                >
                  Create subdivision
                </Button>
              )}
              {step === "homes" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goTo("/homes")}
                >
                  Create home
                </Button>
              )}
              {step === "template" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goTo("/admin?tab=work-templates")}
                >
                  Review template
                </Button>
              )}
              {step === "contractors" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goTo("/admin?tab=contractors")}
                >
                  Add contractor
                </Button>
              )}
              {step === "team" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goTo("/admin?tab=users")}
                >
                  Invite user
                </Button>
              )}
              {step === "flow" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goTo("/flow")}
                >
                  Open Flow
                </Button>
              )}

              {step === "intro" && (
                <Button type="button" size="sm" onClick={nextStep}>
                  Start tour
                </Button>
              )}
              {step !== "intro" && step !== "complete" && (
                <Button type="button" size="sm" onClick={nextStep}>
                  Next
                </Button>
              )}
              {step === "complete" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    completeOnboarding()
                    goTo("/dashboard")
                  }}
                >
                  Go to Dashboard
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

