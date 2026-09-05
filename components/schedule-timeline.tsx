"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { format, startOfDay } from "date-fns"
import {
  getDeltaDays,
  getScheduleStatus,
  getForecastPercent,
  getTimelineLabelLayout,
  type TimelineLabelLayout,
} from "@/lib/schedule-timeline"
import { formatCompletionVsTarget } from "@/lib/schedule-status"
import { cn } from "@/lib/utils"

export type ScheduleTimelineProps = {
  startDate: string | null
  targetDate: string | null
  forecastDate: string | null
  /** Optional: today for "Today" label on forecast */
  today?: Date
  /** When true, show historical completion vs target — not operational "behind". */
  isComplete?: boolean
  completedAt?: string | null
}

const ANCHOR_SIZE = 10
const FORECAST_MARKER_SIZE = 14
const TRACK_H = 6
/** Clamp forecast marker position so it never overlaps start (0) or target (100). */
const CLAMP_MIN = 8
const CLAMP_MAX = 92
/** Pixel gap below which Forecast/Target labels switch to vertical split. */
const SPLIT_THRESHOLD_PX = 90
/** Pixel gap below which markers are treated as a stacked cluster. */
const CLUSTER_THRESHOLD_PX = 28

function formatMarkerDate(date: Date, today: Date): string {
  return format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
    ? "Today"
    : format(date, "MMM d")
}

function MarkerCaption({
  label,
  shortLabel,
  dateText,
  fullDate,
  align,
  className,
}: {
  label: string
  shortLabel?: string
  dateText: string
  fullDate: string
  align: "start" | "center" | "end"
  className?: string
}) {
  const alignClass =
    align === "start"
      ? "items-start text-left"
      : align === "end"
        ? "items-end text-right"
        : "items-center text-center"

  return (
    <div
      className={cn(
        "flex flex-col min-w-0 transition-opacity duration-200 ease-out",
        alignClass,
        className
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate w-full hidden sm:block">
        {label}
      </span>
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate w-full sm:hidden">
        {shortLabel ?? label}
      </span>
      <span
        className="mt-0.5 text-sm font-semibold truncate w-full"
        title={fullDate}
      >
        {dateText}
      </span>
    </div>
  )
}

export function ScheduleTimeline({
  startDate,
  targetDate,
  forecastDate,
  today = startOfDay(new Date()),
  isComplete = false,
  completedAt = null,
}: ScheduleTimelineProps) {
  const start = startDate ? startOfDay(new Date(startDate)) : null
  const target = targetDate ? startOfDay(new Date(targetDate)) : null
  const forecast = forecastDate ? startOfDay(new Date(forecastDate)) : null

  const hasAll = start != null && target != null && forecast != null
  const diffDays = hasAll ? getDeltaDays(forecast, target) : 0
  const status = getScheduleStatus(diffDays)
  const forecastPercent = hasAll ? getForecastPercent(start, target, forecast) : 50
  const completionSummary = isComplete
    ? formatCompletionVsTarget(completedAt, targetDate)
    : null

  const renderForecastPercent = Math.max(
    CLAMP_MIN,
    Math.min(CLAMP_MAX, forecastPercent)
  )
  const isBehind = !isComplete && hasAll && diffDays > 0

  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidthPx, setTrackWidthPx] = useState(0)

  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return

    const measure = () => {
      setTrackWidthPx(el.getBoundingClientRect().width)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasAll, startDate, targetDate, forecastDate])

  const pixelGap =
    trackWidthPx > 0
      ? (trackWidthPx * Math.abs(100 - renderForecastPercent)) / 100
      : Number.POSITIVE_INFINITY

  const labelLayout: TimelineLabelLayout = hasAll
    ? getTimelineLabelLayout(pixelGap, {
        splitThresholdPx: SPLIT_THRESHOLD_PX,
        clusterThresholdPx: CLUSTER_THRESHOLD_PX,
      })
    : "spread"

  // Extra headroom when Forecast label sits above the track.
  const trackTopPx = labelLayout === "split" ? 78 : 52

  const forecastMarkerColor = isComplete
    ? "bg-green-600"
    : status === "ahead" || status === "on-time"
      ? "bg-green-500"
      : diffDays <= 7
        ? "bg-amber-500"
        : "bg-destructive"

  const trackLeft = "calc(2rem + 5px)"
  const trackRight = "calc(2rem + 5px)"
  const trackWidthExpr = "(100% - 4rem - 10px)"
  const forecastLeft = `calc(${trackLeft} + ${trackWidthExpr} * ${renderForecastPercent} / 100)`
  const clusterLeft = `calc(${trackLeft} + ${trackWidthExpr} * ${(renderForecastPercent + 100) / 2} / 100)`

  const minHeight =
    labelLayout === "cluster" ? 168 : labelLayout === "split" ? 156 : 128

  return (
    <div
      className="relative w-full overflow-hidden px-8 pb-5 min-w-0 transition-[min-height] duration-200 ease-out"
      style={{ minHeight }}
    >
      {(hasAll || (isComplete && completionSummary)) && (
        <div className="flex flex-col items-center gap-0.5 pb-2">
          {isComplete && completionSummary ? (
            <span
              className="text-sm font-medium tabular-nums text-center break-words max-w-full text-green-700 dark:text-green-400"
              aria-label={completionSummary.label}
            >
              {completionSummary.label}
            </span>
          ) : (
            <span
              className={cn(
                "text-sm font-medium tabular-nums text-center break-words max-w-full",
                (diffDays < 0 || diffDays === 0) && "text-green-600 dark:text-green-400",
                diffDays > 0 && diffDays <= 7 && "text-amber-600 dark:text-amber-400",
                diffDays > 7 && "text-destructive"
              )}
              aria-label={
                diffDays < 0
                  ? `${Math.abs(diffDays)} days ahead`
                  : diffDays === 0
                    ? "On target"
                    : `${diffDays} days behind target`
              }
            >
              {diffDays < 0 && `${Math.abs(diffDays)} days ahead of target`}
              {diffDays === 0 && "On target"}
              {diffDays > 0 && `${diffDays} days behind target`}
            </span>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        data-timeline-track
        className="absolute rounded-full bg-muted transition-[top] duration-200 ease-out"
        style={{ top: trackTopPx, left: trackLeft, right: trackRight, height: TRACK_H }}
        aria-hidden
      />

      {hasAll && isBehind && (
        <div
          className={cn(
            "absolute rounded-r-full pointer-events-none transition-[top] duration-200 ease-out",
            diffDays <= 7 ? "bg-amber-500/25" : "bg-destructive/25"
          )}
          style={{
            top: trackTopPx,
            left: forecastLeft,
            right: trackRight,
            height: TRACK_H,
          }}
          aria-hidden
        />
      )}

      {start != null && (
        <div
          className="absolute flex flex-col items-start min-w-0 max-w-[40%]"
          style={{ left: trackLeft, top: 0 }}
        >
          <div
            className="rounded-full bg-muted-foreground shrink-0 transition-[margin] duration-200 ease-out"
            style={{
              width: ANCHOR_SIZE,
              height: ANCHOR_SIZE,
              marginTop: trackTopPx - ANCHOR_SIZE / 2,
            }}
            aria-hidden
          />
          <MarkerCaption
            label="Start"
            dateText={format(start, "MMM d")}
            fullDate={format(start, "MMM d, yyyy")}
            align="start"
            className="mt-1.5"
          />
        </div>
      )}

      {target != null && (
        <div
          className="absolute flex flex-col items-end min-w-0 max-w-[40%]"
          style={{ right: "2rem", top: 0 }}
        >
          <div
            className="rounded-full bg-muted-foreground shrink-0 transition-[margin] duration-200 ease-out"
            style={{
              width: ANCHOR_SIZE,
              height: ANCHOR_SIZE,
              marginTop: trackTopPx - ANCHOR_SIZE / 2,
            }}
            aria-hidden
          />
          {labelLayout === "spread" && (
            <MarkerCaption
              label="Target"
              dateText={format(target, "MMM d")}
              fullDate={format(target, "MMM d, yyyy")}
              align="end"
              className="mt-1.5"
            />
          )}
        </div>
      )}

      {forecast != null && start != null && target != null && (
        <div
          className="absolute"
          style={{
            left: forecastLeft,
            top: trackTopPx - FORECAST_MARKER_SIZE / 2,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className={cn(
              "rounded-full shrink-0 ring-2 ring-background transition-colors duration-200",
              forecastMarkerColor
            )}
            style={{
              width: FORECAST_MARKER_SIZE,
              height: FORECAST_MARKER_SIZE,
            }}
            aria-hidden
          />
        </div>
      )}

      {/* Spread: Forecast caption under marker */}
      {hasAll && labelLayout === "spread" && forecast != null && (
        <div
          className="absolute flex flex-col items-center min-w-0 max-w-[30%] transition-opacity duration-200 ease-out"
          style={{
            left: forecastLeft,
            top: trackTopPx + TRACK_H + 8,
            transform: "translateX(-50%)",
          }}
        >
          <MarkerCaption
            label="Forecast"
            shortLabel="Fcst"
            dateText={formatMarkerDate(forecast, today)}
            fullDate={format(forecast, "MMM d, yyyy")}
            align="center"
          />
        </div>
      )}

      {/* Split: Forecast above track, Target below — never side-by-side when close */}
      {hasAll && labelLayout === "split" && forecast != null && (
        <div
          className="absolute flex flex-col items-center min-w-0 max-w-[36%] transition-opacity duration-200 ease-out"
          style={{
            left: forecastLeft,
            top: trackTopPx - FORECAST_MARKER_SIZE / 2 - 6,
            transform: "translate(-50%, -100%)",
          }}
        >
          <MarkerCaption
            label="Forecast"
            shortLabel="Fcst"
            dateText={formatMarkerDate(forecast, today)}
            fullDate={format(forecast, "MMM d, yyyy")}
            align="center"
          />
        </div>
      )}
      {hasAll && labelLayout === "split" && target != null && (
        <div
          className="absolute flex flex-col items-end min-w-0 max-w-[40%] transition-opacity duration-200 ease-out"
          style={{ right: "2rem", top: trackTopPx + TRACK_H + 8 }}
        >
          <MarkerCaption
            label="Target"
            dateText={format(target, "MMM d")}
            fullDate={format(target, "MMM d, yyyy")}
            align="end"
          />
        </div>
      )}

      {/* Cluster: stacked captions under midpoint */}
      {hasAll && labelLayout === "cluster" && forecast != null && target != null && (
        <div
          className="absolute flex flex-col items-center gap-2 transition-opacity duration-200 ease-out"
          style={{
            left: clusterLeft,
            top: trackTopPx + TRACK_H + 10,
            transform: "translateX(-50%)",
            maxWidth: "70%",
          }}
        >
          <MarkerCaption
            label="Forecast"
            shortLabel="Fcst"
            dateText={formatMarkerDate(forecast, today)}
            fullDate={format(forecast, "MMM d, yyyy")}
            align="center"
          />
          <MarkerCaption
            label="Target"
            dateText={format(target, "MMM d")}
            fullDate={format(target, "MMM d, yyyy")}
            align="center"
          />
        </div>
      )}
    </div>
  )
}
