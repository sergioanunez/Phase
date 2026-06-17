"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import type { ScheduleStatus } from "@/lib/schedule-status"
import { StatusPill } from "./status-pill"
import { ProgressBar } from "./progress-bar"

function formatFloorPlanLabel(planName?: string | null, planVariant?: string | null): string | null {
  const label = [planName, planVariant].filter(Boolean).join(" – ")
  return label || null
}

function HomeCardThumbnail({
  homeId,
  hasThumbnail,
}: {
  homeId: string
  hasThumbnail?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!hasThumbnail) {
      setUrl(null)
      return
    }
    let cancelled = false
    fetch(`/api/homes/${homeId}/thumbnail`)
      .then((res) => res.json())
      .then((data: { exists?: boolean; signedUrl?: string }) => {
        if (!cancelled && data.exists && data.signedUrl) {
          setUrl(data.signedUrl)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [homeId, hasThumbnail])

  if (!hasThumbnail) return null

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E6E8EF] bg-muted/30">
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
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
  const floorPlanLabel = formatFloorPlanLabel(home.planName, home.planVariant)

  return (
    <Link
      href={`/homes/${home.id}`}
      className="block rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {/* Top row: thumbnail, address, status */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <HomeCardThumbnail homeId={home.id} hasThumbnail={home.hasThumbnail} />
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
