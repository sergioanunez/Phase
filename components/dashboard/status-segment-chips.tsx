"use client"

import Link from "next/link"

export interface StatusSegmentChipsProps {
  statusCounts: { notStarted: number; onTrack: number; atRisk: number; behind: number }
}

export function StatusSegmentChips({ statusCounts }: StatusSegmentChipsProps) {
  const segments = [
    {
      label: "Not Started",
      count: statusCounts.notStarted,
      href: "/homes?status=not_started",
      dotClass: "bg-slate-400",
      chipClass:
        "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 min-h-[44px] flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    },
    {
      label: "On Track",
      count: statusCounts.onTrack,
      href: "/homes?status=on_track",
      dotClass: "bg-green-500",
      chipClass:
        "border-green-200 bg-green-50 text-green-800 hover:bg-green-100 min-h-[44px] flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    },
    {
      label: "At Risk",
      count: statusCounts.atRisk,
      href: "/homes?status=at_risk",
      dotClass: "bg-amber-500",
      chipClass:
        "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 min-h-[44px] flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    },
    {
      label: "Behind",
      count: statusCounts.behind,
      href: "/homes?status=behind",
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
      {segments.map((seg, i) => (
        <Link
          key={seg.label}
          href={seg.href}
          className={`flex shrink-0 items-center gap-2 rounded-xl border ${seg.chipClass}`}
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dotClass} ${i === forecastSegmentIndex ? "animate-forecast-pulse opacity-90" : ""}`}
            aria-hidden
          />
          <span>
            {seg.label}: {seg.count}
          </span>
        </Link>
      ))}
    </div>
  )
}
