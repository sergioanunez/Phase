"use client"

import type { ScheduleStatus } from "@/lib/schedule-status"
import { canOpenDrilldown } from "@/lib/dashboard/drilldown"

export interface StatusSegmentChipsProps {
  statusCounts: { notStarted: number; onTrack: number; atRisk: number; behind: number }
  onStatusSelect?: (status: ScheduleStatus, count: number) => void
}

export function StatusSegmentChips({
  statusCounts,
  onStatusSelect,
}: StatusSegmentChipsProps) {
  const segments: Array<{
    status: ScheduleStatus
    label: string
    count: number
    dotClass: string
    chipClass: string
  }> = [
    {
      status: "not_started",
      label: "Not Started",
      count: statusCounts.notStarted,
      dotClass: "bg-slate-400",
      chipClass:
        "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 min-h-[44px] flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    },
    {
      status: "on_track",
      label: "On Track",
      count: statusCounts.onTrack,
      dotClass: "bg-green-500",
      chipClass:
        "border-green-200 bg-green-50 text-green-800 hover:bg-green-100 min-h-[44px] flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    },
    {
      status: "at_risk",
      label: "At Risk",
      count: statusCounts.atRisk,
      dotClass: "bg-amber-500",
      chipClass:
        "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 min-h-[44px] flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    },
    {
      status: "behind",
      label: "Behind",
      count: statusCounts.behind,
      dotClass: "bg-red-500",
      chipClass:
        "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 min-h-[44px] flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    },
  ]

  const forecastSegmentIndex =
    statusCounts.onTrack > 0
      ? 1
      : statusCounts.atRisk > 0
        ? 2
        : statusCounts.behind > 0
          ? 3
          : statusCounts.notStarted > 0
            ? 0
            : -1

  return (
    <div className="flex flex-wrap gap-3">
      {segments.map((seg, i) => {
        const interactive = canOpenDrilldown(seg.count)
        const className = `flex shrink-0 items-center gap-2 rounded-xl border ${seg.chipClass} ${
          interactive ? "" : "cursor-default opacity-50"
        }`
        const content = (
          <>
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dotClass} ${i === forecastSegmentIndex ? "animate-forecast-pulse opacity-90" : ""}`}
              aria-hidden
            />
            <span>
              {seg.label}: {seg.count}
            </span>
          </>
        )
        if (!interactive) {
          return (
            <span key={seg.label} className={className} aria-disabled="true">
              {content}
            </span>
          )
        }
        return (
          <button
            key={seg.label}
            type="button"
            className={className}
            aria-label={`View ${seg.count} ${seg.label.toLowerCase()} homes`}
            onClick={() => onStatusSelect?.(seg.status, seg.count)}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
