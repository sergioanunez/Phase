"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  onStartTour: () => void
  onSkip: () => void
  className?: string
}

export function WelcomeBanner({ onStartTour, onSkip, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5",
        "border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-white",
        className
      )}
      role="region"
      aria-label="Welcome to Phase"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-sky-600" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">Welcome to Phase</h2>
          </div>
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">
            Your construction field operating system.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Track homes, coordinate contractors, and keep schedules moving.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Take a quick tour to see how Phase is set up and how work moves through the system.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <Button size="sm" onClick={onStartTour} className="min-w-[100px]">
            Start Tour
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="min-w-[100px] text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}
