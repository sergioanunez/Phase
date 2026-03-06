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

  const forecastMarkerColor =
    status === "ahead"
      ? "bg-green-500"
      : status === "on-time"
        ? "bg-muted-foreground"
        : diffDays < 7
          ? "bg-amber-500"
          : "bg-destructive"

  const showForecastLabel = forecastPercent >= 18 && forecastPercent <= 82

  const trackLeft = "calc(2rem + 5px)"
  const trackRight = "calc(2rem + 5px)"
  const forecastLeft = `calc(${trackLeft} + (100% - 4rem - 10px) * ${forecastPercent} / 100)`

  return (
    <div className="relative w-full min-h-[108px] overflow-hidden px-8">
      {/* Day count title above the timeline */}
      {hasAll && (
        <div className="flex justify-center pb-2">
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
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
            {diffDays < 0 && `${Math.abs(diffDays)} days ahead`}
            {diffDays === 0 && "On target"}
            {diffDays > 0 && `${diffDays} days behind target`}
          </span>
        </div>
      )}
      {/* Single track: Start (0%) → Target (100%) */}
      <div
        className="absolute rounded-full bg-muted"
        style={{ top: TRACK_TOP_PX, left: trackLeft, right: trackRight, height: TRACK_H }}
        aria-hidden
      />

      {/* Optional tint when behind: red from Target backwards */}
      {hasAll && status === "behind" && (
        <div
          className="absolute rounded-full bg-destructive/25 pointer-events-none"
          style={{
            top: TRACK_TOP_PX,
            left: "75%",
            right: trackRight,
            height: TRACK_H,
          }}
          aria-hidden
        />
      )}

      {/* Start marker (0%): keep fully inside container */}
      {start != null && (
        <div
          className="absolute flex flex-col items-start"
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
          <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Start
          </span>
          <span className="mt-0.5 text-sm font-semibold">{format(start, "MMM d")}</span>
        </div>
      )}

      {/* Target marker (100%): keep fully inside container, no overflow */}
      {target != null && (
        <div
          className="absolute flex flex-col items-end"
          style={{
            right: "2rem",
            top: 0,
          }}
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
          <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Target
          </span>
          <span className="mt-0.5 text-sm font-semibold">{format(target, "MMM d")}</span>
        </div>
      )}

      {/* Forecast marker (forecastPercent %) */}
      {forecast != null && start != null && target != null && (
        <div
          className="absolute flex flex-col items-center"
          style={{
            left: forecastLeft,
            top: 0,
            transform: "translateX(-50%)",
            minWidth: 0,
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
          {showForecastLabel ? (
            <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Forecast
            </span>
          ) : null}
          <span className="mt-0.5 text-sm font-semibold">
            {format(forecast, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
              ? "Today"
              : format(forecast, "MMM d")}
          </span>
        </div>
      )}
    </div>
  )
}
