"use client"

import { useState } from "react"
import { isTaskIncompleteForProgress } from "@/lib/task-status"
import { format } from "date-fns"
import { Home } from "lucide-react"
import type { ScheduleStatus } from "@/lib/schedule-status"
import { StatusPill } from "./status-pill"
import { ProgressBar } from "./progress-bar"
import Link from "next/link"

function formatFloorPlanLabel(planName?: string | null, planVariant?: string | null): string | null {
  const label = [planName, planVariant].filter(Boolean).join(" – ")
  return label || null
}

function HomeCardThumbnail({ thumbnailUrl }: { thumbnailUrl?: string | null }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showImage = !!thumbnailUrl && !failed

  return (
    <div
      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E6E8EF] bg-muted/30"
      aria-hidden
    >
      {showImage ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
          )}
          <img
            src={thumbnailUrl}
            alt=""
            className="pointer-events-none h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/70">
          <Home className="h-6 w-6" strokeWidth={1.75} />
        </div>
      )}
    </div>
  )
}

export interface HomeCardHome {
  id: string
  addressOrLot: string
  forecastCompletionDate: string | null
  targetCompletionDate: string | null
  subdivision: { id: string; name: string }
  planName?: string | null
  planVariant?: string | null
  hasThumbnail?: boolean
  thumbnailUrl?: string | null
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
  /** Historical completion line when status is completed. */
  completionLabel?: string | null
  onNavigate?: () => void
}

export function HomeCard({
  home,
  status,
  progress,
  completionLabel,
  onNavigate,
}: HomeCardProps) {
  const criticalIds = home.criticalPathTaskIds ?? []
  const lastCriticalScheduledTask = home.tasks
    .filter(
      (t) =>
        criticalIds.includes(t.id) &&
        t.scheduledDate &&
        isTaskIncompleteForProgress(t.status ?? "")
    )
    .sort((a, b) => new Date(b.scheduledDate!).getTime() - new Date(a.scheduledDate!).getTime())[0]

  const forecastStr = home.forecastCompletionDate
    ? format(new Date(home.forecastCompletionDate), "MMM d")
    : "—"
  const targetStr = home.targetCompletionDate
    ? format(new Date(home.targetCompletionDate), "MMM d")
    : "—"
  const floorPlanLabel = formatFloorPlanLabel(home.planName, home.planVariant)

  return (
    <Link
      id={`home-card-${home.id}`}
      href={`/homes/${home.id}`}
      onClick={() => onNavigate?.()}
      className="block rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {/* Top row: thumbnail, address, status */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <HomeCardThumbnail thumbnailUrl={home.thumbnailUrl} />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold leading-tight text-foreground">
              {home.addressOrLot}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {home.subdivision.name}
              {floorPlanLabel ? (
                <>
                  <span className="text-muted-foreground/70"> · </span>
                  <span>{floorPlanLabel}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <StatusPill status={status} className="shrink-0" />
      </div>

      {/* Dates: Forecast | Target — or historical completion when done */}
      <div className="mb-3 text-sm">
        {status === "completed" ? (
          <span className="font-medium text-foreground">
            {completionLabel ?? "Completed"}
          </span>
        ) : (
          <>
            <span className="font-medium text-foreground">Forecast: {forecastStr}</span>
            <span className="text-muted-foreground"> | Target: {targetStr}</span>
          </>
        )}
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
