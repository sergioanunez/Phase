"use client"

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScheduleStatus } from "@/lib/schedule-status"

export interface ProgressBarProps {
  value: number
  status?: ScheduleStatus
  showChevron?: boolean
  className?: string
}

const fillByStatus: Record<ScheduleStatus, string> = {
  completed: "bg-green-600",
  not_started: "bg-gray-300",
  on_track: "bg-green-500",
  at_risk: "bg-amber-500",
  behind: "bg-red-500",
}

export function ProgressBar({
  value,
  status = "on_track",
  showChevron = true,
  className,
}: ProgressBarProps) {
  const fillClass = fillByStatus[status]
  const clamped = Math.min(100, Math.max(0, value))
  const isNotStarted = status === "not_started"

  if (isNotStarted) {
    return (
      <div className={cn("flex w-full min-w-0 items-center gap-2", className)}>
        <p className="text-sm text-muted-foreground">Construction has not started yet.</p>
        {showChevron && (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex w-full min-w-0 items-center gap-2", className)}>
      <div
        className="h-2 min-w-0 flex-1 rounded-full bg-[#E5E7EB] overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full min-w-0 rounded-full transition-[width]", fillClass)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-sm font-medium text-foreground tabular-nums">
        {clamped}%
      </span>
      {showChevron && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  )
}
