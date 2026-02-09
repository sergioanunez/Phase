"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { CheckCircle2, Package, Wrench, AlertCircle, Flag } from "lucide-react"

export type CalendarEventType = "inspection" | "delivery" | "trade" | "milestone"
export type EventStatus = "on_track" | "at_risk" | "behind" | "completed" | "overdue"

export interface EventRowData {
  id: string
  title: string
  type: CalendarEventType
  status?: EventStatus
  homeCount?: number
  homeId?: string
  homeLabel?: string
  communityName?: string
  badge?: string
  dateLabel?: string
}

export interface EventRowProps {
  event: EventRowData
  showChevron?: boolean
  className?: string
}

function EventIcon({ type, status }: { type: CalendarEventType; status?: EventStatus }) {
  if (status === "overdue" || status === "behind") {
    return <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
  }
  switch (type) {
    case "inspection":
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
    case "delivery":
      return <Package className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
    case "milestone":
      return <Flag className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    default:
      return <Wrench className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
  }
}

function StatusBadge({ status, label }: { status?: EventStatus; label?: string }) {
  const text = label ?? (status === "completed" ? "Completed" : status === "overdue" ? "Overdue" : status === "at_risk" ? "At Risk" : status === "behind" ? "Behind" : null)
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

export function EventRow({
  event,
  showChevron = true,
  className,
}: EventRowProps) {
  const subtext = event.homeCount != null
    ? `${event.homeCount} home${event.homeCount !== 1 ? "s" : ""}`
    : event.communityName ?? event.homeLabel ?? ""

  const content = (
    <>
      <EventIcon type={event.type} status={event.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{event.title}</span>
          {event.dateLabel && (
            <span className="text-sm text-muted-foreground">{event.dateLabel}</span>
          )}
          <StatusBadge status={event.status} label={event.badge} />
        </div>
        {subtext ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtext}</p>
        ) : null}
      </div>
      {event.homeCount != null && event.homeCount > 0 && (
        <span className="text-sm text-muted-foreground">{event.homeCount}</span>
      )}
      {showChevron && (
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          ›
        </span>
      )}
    </>
  )

  const rowClass = cn(
    "flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50",
    className
  )

  if (event.homeId) {
    return (
      <Link href={`/homes/${event.homeId}`} className={rowClass}>
        {content}
      </Link>
    )
  }

  return <div className={rowClass}>{content}</div>
}
