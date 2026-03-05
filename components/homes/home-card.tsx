"use client"

import Link from "next/link"
import { format } from "date-fns"
import type { ScheduleStatus } from "@/lib/schedule-status"
import { StatusPill } from "./status-pill"
import { ProgressBar } from "./progress-bar"

export interface HomeCardHome {
  id: string
  addressOrLot: string
  forecastCompletionDate: string | null
  targetCompletionDate: string | null
  subdivision: { id: string; name: string }
  criticalPathTaskIds?: string[]
  tasks: Array<{
    id: string
    status?: string
    scheduledDate: string | null
    nameSnapshot: string
    contractor: { id: string; companyName: string } | null
  }>
}

export interface HomeCardProps {
  home: HomeCardHome
  status: ScheduleStatus
  progress: number
}

export function HomeCard({ home, status, progress }: HomeCardProps) {
  const criticalIds = home.criticalPathTaskIds ?? []
  const lastCriticalScheduledTask = home.tasks
    .filter(
      (t) =>
        criticalIds.includes(t.id) &&
        t.scheduledDate &&
        t.status !== "Completed"
    )
    .sort((a, b) => new Date(b.scheduledDate!).getTime() - new Date(a.scheduledDate!).getTime())[0]

  const forecastStr = home.forecastCompletionDate
    ? format(new Date(home.forecastCompletionDate), "MMM d")
    : "—"
  const targetStr = home.targetCompletionDate
    ? format(new Date(home.targetCompletionDate), "MMM d")
    : "—"

  return (
    <Link
      href={`/homes/${home.id}`}
      className="block rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {/* Top row: Address + Status pill */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold leading-tight text-foreground">
          {home.addressOrLot}
        </h3>
        <StatusPill status={status} className="shrink-0" />
      </div>

      {/* Secondary: Community name */}
      <p className="mb-2 text-sm text-muted-foreground">
        {home.subdivision.name}
      </p>

      {/* Dates: Forecast | Target */}
      <div className="mb-3 text-sm">
        <span className="font-medium text-foreground">Forecast: {forecastStr}</span>
        <span className="text-muted-foreground"> | Target: {targetStr}</span>
      </div>

      {/* Progress bar + percent + chevron */}
      <div className="mb-3">
        <ProgressBar value={progress} status={status} showChevron />
      </div>

      {/* Last critical task scheduled */}
      <div>
        <p className="text-xs text-muted-foreground">Last critical task scheduled:</p>
        {lastCriticalScheduledTask ? (
          <p className="text-sm text-foreground">
            {lastCriticalScheduledTask.nameSnapshot} ·{" "}
            {format(new Date(lastCriticalScheduledTask.scheduledDate!), "MMM d")} ·{" "}
            {lastCriticalScheduledTask.contractor?.companyName ?? "—"}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No critical work scheduled</p>
        )}
      </div>
    </Link>
  )
}
