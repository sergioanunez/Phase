"use client"

import { format, startOfDay } from "date-fns"
import {
  getDeltaDays,
  getScheduleStatus,
  getScheduleBadge,
  getTimelinePositions,
} from "@/lib/schedule-timeline"
import { cn } from "@/lib/utils"

export type ScheduleTimelineProps = {
  startDate: string | null
  targetDate: string | null
  forecastDate: string | null
  /** Optional: today for "Today" label on forecast */
  today?: Date
}

const LINE_TOP_PX = 20
const MARKER_SIZE = 12
const TICK_HEIGHT = 10

export function ScheduleTimeline({
  startDate,
  targetDate,
  forecastDate,
  today = startOfDay(new Date()),
}: ScheduleTimelineProps) {
  const start = startDate ? startOfDay(new Date(startDate)) : null
  const target = targetDate ? startOfDay(new Date(targetDate)) : null
  const forecast = forecastDate ? startOfDay(new Date(forecastDate)) : null

  const { points, hasOverrun, overrunStart, overrunEnd } = getTimelinePositions(
    start,
    target,
    forecast
  )

  const hasDelta = forecast != null && target != null
  const deltaDays = hasDelta ? getDeltaDays(forecast, target) : 0
  const status = getScheduleStatus(deltaDays)
  const badge = getScheduleBadge(deltaDays)

  const forecastColor =
    status === "ahead"
      ? "bg-green-500"
      : status === "on-time"
        ? "bg-amber-400"
        : "bg-red-500"

  return (
    <div className="relative w-full px-2 sm:px-4">
      {/* Rail */}
      <div
        className="absolute left-0 right-0 h-0.5 bg-gray-200"
        style={{ top: LINE_TOP_PX }}
        aria-hidden
      />
      {/* Overrun segment (target → forecast when behind) */}
      {hasOverrun && (
        <div
          className="absolute rounded-sm border border-red-400 border-dashed bg-red-100/70"
          style={{
            top: LINE_TOP_PX - 3,
            height: 6,
            left: `${overrunStart * 100}%`,
            width: `${(overrunEnd - overrunStart) * 100}%`,
          }}
          aria-hidden
        />
      )}

      {/* Markers in chronological order */}
      {points.map((point) => (
        <div
          key={point.type}
          className="absolute flex flex-col items-center"
          style={{
            left: `${point.position * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          {point.type === "target" ? (
            <div
              className="w-0.5 shrink-0 bg-gray-600"
              style={{ height: TICK_HEIGHT, marginTop: LINE_TOP_PX - TICK_HEIGHT }}
              aria-hidden
            />
          ) : (
            <div
              className={cn(
                "mt-2 shrink-0 rounded-full",
                point.type === "start" ? "bg-green-500" : forecastColor,
                point.type === "start" ? "h-3 w-3" : "h-3 w-3"
              )}
              style={{ marginTop: LINE_TOP_PX - MARKER_SIZE / 2 }}
              aria-hidden
            />
          )}
          <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {point.type === "start" ? "Start" : point.type === "target" ? "Target" : "Forecast"}
          </span>
          <span className="mt-0.5 text-sm font-semibold">
            {point.type === "start" && start
              ? format(start, "MMM d")
              : point.type === "target" && target
                ? format(target, "MMM d")
                : point.type === "forecast" && forecast
                  ? format(forecast, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
                    ? "Today"
                    : format(forecast, "MMM d")
                  : "—"}
          </span>
        </div>
      ))}

      {/* Badge: one line, accessible (only when we have both forecast and target) */}
      {hasDelta && (
        <div className="mt-8 flex justify-center">
          <span
            className="inline-block rounded-full bg-muted/60 px-3 py-1 text-sm font-medium text-foreground"
            aria-label={badge.ariaLabel}
          >
            {badge.text}
          </span>
        </div>
      )}
    </div>
  )
}
