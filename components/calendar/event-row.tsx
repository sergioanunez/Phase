"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  Package,
  Wrench,
  AlertCircle,
  Flag,
  ChevronDown,
  ChevronUp,
  MapPin,
} from "lucide-react"
import type { HouseCalendarRow } from "@/lib/calendar/group-events"

export type CalendarEventType =
  | "inspection"
  | "delivery"
  | "trade"
  | "milestone"
  | "punchlist"
export type EventStatus =
  | "on_track"
  | "at_risk"
  | "behind"
  | "completed"
  | "overdue"

/** Legacy flat row shape (day overdue lists, etc.). */
export interface EventRowData {
  id: string
  title: string
  type: CalendarEventType
  status?: EventStatus
  homeCount?: number
  homeId?: string
  homeLabel?: string
  communityName?: string
  contractorName?: string
  badge?: string
  dateLabel?: string
}

export interface EventRowProps {
  event: EventRowData
  showChevron?: boolean
  className?: string
}

const VISIBLE_HOMES = 3

function EventIcon({
  type,
  status,
}: {
  type: CalendarEventType
  status?: EventStatus
}) {
  if (status === "overdue" || status === "behind") {
    return (
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
    )
  }
  if (status === "completed") {
    return (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
    )
  }
  switch (type) {
    case "inspection":
      return (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
      )
    case "delivery":
      return <Package className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
    case "milestone":
      return (
        <Flag className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      )
    case "punchlist":
      return (
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
      )
    default:
      return <Wrench className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
  }
}

function StatusBadge({
  status,
  label,
}: {
  status?: EventStatus
  label?: string
}) {
  const text =
    label ??
    (status === "completed"
      ? "Completed"
      : status === "overdue"
        ? "Overdue"
        : status === "at_risk"
          ? "At Risk"
          : status === "behind"
            ? "Behind"
            : status === "on_track"
              ? "Scheduled"
              : null)
  if (!text) return null
  const variant =
    status === "completed"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : status === "overdue" || status === "behind"
        ? "bg-destructive/10 text-destructive"
        : status === "at_risk"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          : "bg-muted text-muted-foreground"
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        variant
      )}
    >
      {text}
    </span>
  )
}

function SubdivisionBadge({ name }: { name?: string }) {
  if (!name) return null
  return (
    <span className="inline-flex max-w-full items-center gap-0.5 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <MapPin className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  )
}

function homeHref(homeId: string, taskId?: string): string {
  const params = new URLSearchParams()
  if (taskId) {
    params.set("task", taskId)
    params.set("highlight", "1")
  }
  const q = params.toString()
  return q ? `/homes/${homeId}?${q}` : `/homes/${homeId}`
}

const rowClass = (className?: string) =>
  cn(
    "flex min-h-[52px] items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50",
    className
  )

/**
 * Flat event row (single task) — house address primary for house-first scanning.
 */
export function EventRow({
  event,
  showChevron = true,
  className,
}: EventRowProps) {
  const primary = event.homeLabel ?? event.title
  const secondary = event.homeLabel ? event.title : null
  const href = event.homeId
    ? homeHref(event.homeId, event.id)
    : null

  const content = (
    <>
      <EventIcon type={event.type} status={event.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold text-foreground">
                {primary}
              </span>
              {event.dateLabel && (
                <span className="text-sm text-muted-foreground">
                  {event.dateLabel}
                </span>
              )}
              <StatusBadge status={event.status} label={event.badge} />
            </div>
            {secondary && (
              <p className="mt-0.5 line-clamp-2 text-sm text-foreground/80">
                {secondary}
              </p>
            )}
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <SubdivisionBadge name={event.communityName} />
              {event.contractorName ? (
                <span className="truncate text-xs text-muted-foreground">
                  {event.communityName
                    ? `· ${event.contractorName}`
                    : event.contractorName}
                </span>
              ) : null}
            </div>
          </div>
          {showChevron && (
            <span className="shrink-0 pt-0.5 text-muted-foreground" aria-hidden>
              ›
            </span>
          )}
        </div>
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={rowClass(className)}>
        {content}
      </Link>
    )
  }

  return <div className={rowClass(className)}>{content}</div>
}

export interface HouseCalendarRowProps {
  row: HouseCalendarRow
  className?: string
}

/** House-first / multi-home task card used in week & day lists. */
export function HouseCalendarCard({ row, className }: HouseCalendarRowProps) {
  const [expanded, setExpanded] = useState(false)

  if (row.kind === "house") {
    const primaryTask = row.tasks[0]

    return (
      <div className={rowClass(className)}>
        <EventIcon type={row.type} status={row.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link
                  href={homeHref(row.homeId, primaryTask?.id)}
                  className="truncate font-semibold text-foreground hover:underline"
                >
                  {row.homeLabel}
                </Link>
                <StatusBadge status={row.status} />
              </div>

              {row.tasks.length === 1 ? (
                <Link
                  href={homeHref(row.homeId, row.tasks[0].id)}
                  className="mt-0.5 block line-clamp-2 text-sm text-foreground/80 hover:underline"
                >
                  {row.tasks[0].title}
                </Link>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {row.tasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-1.5 text-sm">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/70" />
                      <Link
                        href={homeHref(row.homeId, t.id)}
                        className="line-clamp-2 min-w-0 text-foreground/80 hover:text-foreground hover:underline"
                      >
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                <SubdivisionBadge name={row.communityName} />
                {row.contractorName && (
                  <span className="truncate text-xs text-muted-foreground">
                    {row.communityName ? `· ${row.contractorName}` : row.contractorName}
                  </span>
                )}
              </div>
            </div>
            <Link
              href={homeHref(row.homeId, primaryTask?.id)}
              className="shrink-0 pt-0.5 text-muted-foreground"
              aria-label={`Open ${row.homeLabel}`}
            >
              ›
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // task-homes: same work item across houses
  const visible = expanded ? row.homes : row.homes.slice(0, VISIBLE_HOMES)
  const hiddenCount = Math.max(0, row.homes.length - VISIBLE_HOMES)

  return (
    <div className={cn(rowClass(className), "flex-col items-stretch hover:bg-muted/30")}>
      <div className="flex items-start gap-3">
        <EventIcon type={row.type} status={row.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-foreground">{row.title}</span>
            <StatusBadge status={row.status} />
            {row.communityName && <SubdivisionBadge name={row.communityName} />}
          </div>
          <ul className="mt-1 space-y-0.5">
            {visible.map((h) => (
              <li key={`${h.homeId}-${h.taskId}`}>
                <Link
                  href={homeHref(h.homeId, h.taskId)}
                  className="block truncate text-sm text-foreground/85 hover:text-foreground hover:underline"
                >
                  {h.homeLabel}
                </Link>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="h-3 w-3" aria-hidden />
                </>
              ) : (
                <>
                  +{hiddenCount} more{" "}
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
