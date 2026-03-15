"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type SpotlightStepId =
  | "dashboard"
  | "subdivisions"
  | "homes"
  | "template"
  | "contractors"
  | "team"
  | "flow"
  | "complete"

const STEP_ORDER: SpotlightStepId[] = [
  "dashboard",
  "subdivisions",
  "homes",
  "template",
  "contractors",
  "team",
  "flow",
  "complete",
]

const STEP_CONFIG: Record<
  SpotlightStepId,
  { title: string; description: string; selector: string; route?: string; tab?: string }
> = {
  dashboard: {
    title: "Dashboard",
    description:
      "Your construction control center. See active homes, schedule health, phase distribution, and what needs attention.",
    selector: "[data-onboarding=dashboard]",
    route: "/dashboard",
  },
  subdivisions: {
    title: "Subdivisions",
    description:
      "Subdivisions organize your projects. Each contains multiple homes and their schedules.",
    selector: "[data-onboarding=subdivisions]",
    route: "/admin",
    tab: "subdivisions-homes",
  },
  homes: {
    title: "Homes",
    description:
      "Homes are where construction happens. Each has a build schedule, tasks, punchlists, and contractor assignments.",
    selector: "[data-onboarding=homes]",
  },
  template: {
    title: "Work Items Template",
    description:
      "Defines the build sequence—task order, dependencies, and durations. Every home uses this template.",
    selector: "[data-onboarding=template]",
    route: "/admin",
    tab: "work-templates",
  },
  contractors: {
    title: "Contractors",
    description:
      "Register subcontractors here. They receive task confirmations, punchlists, and schedule notifications.",
    selector: "[data-onboarding=contractors]",
    route: "/admin",
    tab: "contractors",
  },
  team: {
    title: "Team Members",
    description:
      "Invite superintendents and team members. They can schedule work, manage punchlists, and monitor homes.",
    selector: "[data-onboarding=team]",
    route: "/admin",
    tab: "users",
  },
  flow: {
    title: "Flow Mode",
    description:
      "Shows what needs to happen today to keep builds on schedule—what to schedule, order, and what's at risk.",
    selector: "[data-onboarding=flow]",
  },
  complete: {
    title: "You're ready",
    description:
      "Suggested next: create a subdivision, add homes, register contractors, and schedule your first tasks.",
    selector: "[data-onboarding=dashboard]",
  },
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

type Props = {
  step: SpotlightStepId
  onStepChange: (step: SpotlightStepId) => void
  onComplete: () => void
  onSkip: () => void
}

export function SpotlightTour({ step, onStepChange, onComplete, onSkip }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const reduceMotion = prefersReducedMotion()

  const config = STEP_CONFIG[step]
  const stepIndex = STEP_ORDER.indexOf(step)
  const totalSteps = STEP_ORDER.length
  const stepNumber = stepIndex + 1
  const isFirst = stepIndex === 0
  const isComplete = step === "complete"

  const updateTarget = useCallback(() => {
    if (typeof document === "undefined") return
    const el = document.querySelector(config.selector)
    if (el && el instanceof HTMLElement) {
      const rect = el.getBoundingClientRect()
      setTargetRect(rect)
    } else {
      setTargetRect(null)
    }
  }, [config.selector])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const goToRoute = () => {
      if (config.route && config.route !== pathname) {
        const params = new URLSearchParams()
        if (config.tab) params.set("tab", config.tab)
        params.set("tour", "onboarding")
        const url = `${config.route}?${params.toString()}`
        router.push(url)
      } else if (config.route === pathname && config.tab) {
        const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
        params.set("tab", config.tab)
        params.set("tour", "onboarding")
        const url = `${pathname}?${params.toString()}`
        router.push(url)
      }
    }
    goToRoute()
    const t = setTimeout(updateTarget, config.route && config.route !== pathname ? 400 : 50)
    return () => clearTimeout(t)
  }, [mounted, step, config.route, config.tab, pathname, router, updateTarget])

  useEffect(() => {
    if (!mounted) return
    updateTarget()
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateTarget)
      : null
    const el = document.querySelector(config.selector)
    if (el && ro) ro.observe(el)
    window.addEventListener("scroll", updateTarget, true)
    window.addEventListener("resize", updateTarget)
    return () => {
      ro?.disconnect()
      window.removeEventListener("scroll", updateTarget, true)
      window.removeEventListener("resize", updateTarget)
    }
  }, [mounted, step, config.selector, updateTarget])

  useEffect(() => {
    if (!targetRect || !tooltipRef.current) {
      setTooltipStyle(null)
      return
    }
    const tooltip = tooltipRef.current
    const tw = tooltip.offsetWidth
    const th = tooltip.offsetHeight
    const padding = 12
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    let top = targetRect.bottom + padding
    let left = targetRect.left + targetRect.width / 2 - tw / 2
    if (top + th > viewportH - 24) {
      top = targetRect.top - th - padding
    }
    if (top < 24) top = 24
    if (left < 12) left = 12
    if (left + tw > viewportW - 12) left = viewportW - tw - 12
    setTooltipStyle({ top, left })
  }, [targetRect])

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx > 0) onStepChange(STEP_ORDER[idx - 1])
  }

  const goNext = () => {
    if (step === "complete") {
      onComplete()
      return
    }
    const idx = STEP_ORDER.indexOf(step)
    if (idx < STEP_ORDER.length - 1) onStepChange(STEP_ORDER[idx + 1])
    else onComplete()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onSkip])

  if (!mounted) return null

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label={`Tour step ${stepNumber} of ${totalSteps}: ${config.title}`}
    >
      {/* Dim overlay: use a full-screen layer; highlight box will create the "cutout" via box-shadow */}
      <div
        className={cn(
          "absolute inset-0 bg-black/20",
          reduceMotion ? "" : "animate-spotlight-overlay-in"
        )}
      />

      {/* Highlight: same rect as target, transparent with ring + box-shadow to dim rest */}
      {targetRect && !isComplete && (
        <div
          className={cn(
            "absolute rounded-lg ring-2 ring-sky-400/90 ring-offset-2 ring-offset-transparent",
            "bg-transparent",
            reduceMotion ? "" : "transition-[box-shadow] duration-[180ms] ease-out"
          )}
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.22)",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className={cn(
          "absolute z-10 w-[min(340px,calc(100vw-24px))]",
          reduceMotion ? "" : "animate-spotlight-tooltip-in"
        )}
        style={
          tooltipStyle
            ? { top: tooltipStyle.top, left: tooltipStyle.left }
            : { top: 24, left: "50%", transform: "translateX(-50%)" }
        }
      >
        <Card className="shadow-lg border-sky-200/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Step {stepNumber} of {totalSteps}
            </p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{config.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-snug">
              {config.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="text-muted-foreground hover:text-foreground order-2 sm:order-1"
              >
                Skip
              </Button>
              <div className="flex gap-2 order-1 sm:order-2">
                {!isFirst && (
                  <Button variant="outline" size="sm" onClick={goBack}>
                    Back
                  </Button>
                )}
                <Button size="sm" onClick={goNext}>
                  {isComplete ? "Done" : "Next"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
