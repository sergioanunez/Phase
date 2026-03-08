"use client"

import { format, startOfDay } from "date-fns"
import {
  getDeltaDays,
  getScheduleStatus,
  getForecastPercent,
} from "@/lib/schedule-timeline"
import { cn } from "@/lib/utils"

export type ScheduleTimelineProps = {
  startDate: string | null
  targetDate: string | null
  forecastDate: string | null
  /** Optional: today for "Today" label on forecast */
  today?: Date
}

const TRACK_TOP_PX = 36
const ANCHOR_SIZE = 10
const FORECAST_MARKER_SIZE = 14
const TRACK_H = 6
/** Clamp forecast marker position so it never overlaps start (0) or target (100). */
const CLAMP_MIN = 8
const CLAMP_MAX = 92
/** When forecast is within this many % of target, stack forecast label to avoid collision. */
const NEAR_TARGET_THRESHOLD = 12

export function ScheduleTimeline({
  startDate,
  targetDate,
  forecastDate,
  today = startOfDay(new Date()),
}: ScheduleTimelineProps) {
  const start = startDate ? startOfDay(new Date(startDate)) : null
  const target = targetDate ? startOfDay(new Date(targetDate)) : null
  const forecast = forecastDate ? startOfDay(new Date(forecastDate)) : null

  const hasAll = start != null && target != null && forecast != null
  const diffDays = hasAll ? getDeltaDays(forecast, target) : 0
  const status = getScheduleStatus(diffDays)
  const forecastPercent = hasAll ? getForecastPercent(start, target, forecast) : 50

  const renderForecastPercent = Math.max(
    CLAMP_MIN,
    Math.min(CLAMP_MAX, forecastPercent)
  )
  const isBehind = hasAll && diffDays > 0
  const isNearTarget = hasAll && 100 - renderForecastPercent < NEAR_TARGET_THRESHOLD
  const stackForecastLabel = isBehind || isNearTarget

  const forecastMarkerColor =
    status === "ahead"
      ? "bg-green-500"
      : status === "on-time"
        ? "bg-muted-foreground"
        : diffDays < 7
          ? "bg-amber-500"
          : "bg-destructive"

  const trackLeft = "calc(2rem + 5px)"
  const trackRight = "calc(2rem + 5px)"
  const trackWidthExpr = "(100% - 4rem - 10px)"
  const forecastLeft = `calc(${trackLeft} + ${trackWidthExpr} * ${renderForecastPercent} / 100)`

  return (
    <div className="relative w-full min-h-[120px] overflow-hidden px-8 min-w-0">
      {/* Status row: dedicated line above track — never overlaps markers */}
      {hasAll && (
        <div className="flex flex-col items-center gap-0.5 pb-2">
          <span
            className={cn(
              "text-sm font-medium tabular-nums text-center break-words max-w-full",
              diffDays < 0 && "text-green-600 dark:text-green-400",
              diffDays === 0 && "text-muted-foreground",
              diffDays > 0 && diffDays < 7 && "text-amber-600 dark:text-amber-400",
              diffDays >= 7 && "text-destructive"
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
          {isBehind && (
            <span className="text-xs text-muted-foreground">
              Forecast: {format(forecast!, "MMM d")}
            </span>
          )}
        </div>
      )}

      {/* Track row: start → forecast → target */}
      <div
        className="absolute rounded-full bg-muted"
        style={{ top: TRACK_TOP_PX, left: trackLeft, right: trackRight, height: TRACK_H }}
        aria-hidden
      />

      {/* Red overrun segment when behind: from clamped forecast position to target */}
      {hasAll && isBehind && (
        <div
          className="absolute rounded-r-full bg-destructive/25 pointer-events-none"
          style={{
            top: TRACK_TOP_PX,
            left: forecastLeft,
            right: trackRight,
            height: TRACK_H,
          }}
          aria-hidden
        />
      )}

      {/* Start marker (0%) */}
      {start != null && (
        <div
          className="absolute flex flex-col items-start min-w-0 max-w-[45%]"
          style={{ left: trackLeft, top: 0 }}
        >
          <div
            className="rounded-full bg-muted-foreground shrink-0"
            style={{
              width: ANCHOR_SIZE,
              height: ANCHOR_SIZE,
              marginTop: TRACK_TOP_PX - ANCHOR_SIZE / 2,
            }}
            aria-hidden
          />
          <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground truncate w-full">
            Start
          </span>
          <span className="mt-0.5 text-sm font-semibold truncate w-full" title={format(start, "MMM d, yyyy")}>
            {format(start, "MMM d")}
          </span>
        </div>
      )}

      {/* Target marker (100%): fixed at right */}
      {target != null && (
        <div
          className="absolute flex flex-col items-end min-w-0 max-w-[45%]"
          style={{ right: "2rem", top: 0 }}
        >
          <div
            className="rounded-full bg-muted-foreground shrink-0"
            style={{
              width: ANCHOR_SIZE,
              height: ANCHOR_SIZE,
              marginTop: TRACK_TOP_PX - ANCHOR_SIZE / 2,
            }}
            aria-hidden
          />
          <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground truncate w-full text-right">
            Target
          </span>
          <span className="mt-0.5 text-sm font-semibold truncate w-full text-right" title={format(target, "MMM d, yyyy")}>
            {format(target, "MMM d")}
          </span>
        </div>
      )}

      {/* Forecast marker: position clamped to avoid overlap with target */}
      {forecast != null && start != null && target != null && (
        <div
          className="absolute flex flex-col items-center min-w-0"
          style={{
            left: forecastLeft,
            top: 0,
            transform: "translateX(-50%)",
            maxWidth: "30%",
          }}
        >
          <div
            className={cn(
              "rounded-full shrink-0 ring-2 ring-background",
              forecastMarkerColor
            )}
            style={{
              width: FORECAST_MARKER_SIZE,
              height: FORECAST_MARKER_SIZE,
              marginTop: TRACK_TOP_PX - FORECAST_MARKER_SIZE / 2,
            }}
            aria-hidden
          />
          {!stackForecastLabel && (
            <>
              <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground truncate w-full text-center sm:inline hidden">
                Forecast
              </span>
              <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground truncate w-full text-center sm:hidden">
                Fcst
              </span>
              <span className="mt-0.5 text-sm font-semibold truncate w-full text-center" title={format(forecast, "MMM d, yyyy")}>
                {format(forecast, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
                  ? "Today"
                  : format(forecast, "MMM d")}
              </span>
            </>
          )}
        </div>
      )}

      {/* When near target (not behind): forecast date below track to avoid collision with target label */}
      {hasAll && isNearTarget && !isBehind && (
        <div className="absolute left-0 right-0 flex justify-center" style={{ top: TRACK_TOP_PX + TRACK_H + 10 }}>
          <span className="text-xs text-muted-foreground">
            Forecast: {format(forecast!, "MMM d")}
          </span>
        </div>
      )}
    </div>
  )
}
