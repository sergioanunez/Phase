"use client"

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { EventRow, type EventRowData } from "./event-row"
import Link from "next/link"

export interface DayCardProps {
  dayLabel: string
  events: EventRowData[]
  maxVisible?: number
  viewAllHref?: string
  viewAllCount?: number
  onViewAll?: () => void
  defaultExpanded?: boolean
  className?: string
}

export function DayCard({
  dayLabel,
  events,
  maxVisible = 5,
  viewAllHref,
  viewAllCount,
  onViewAll,
  defaultExpanded = true,
  className,
}: DayCardProps) {
  const visible = events.slice(0, maxVisible)
  const total = viewAllCount ?? events.length
  const hasMore = total > maxVisible

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between pb-3">
        <span className="font-semibold text-foreground">{dayLabel}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <ul className="space-y-1">
        {visible.map((ev) => (
          <li key={ev.id}>
            <EventRow event={ev} showChevron />
          </li>
        ))}
      </ul>
      {hasMore && (onViewAll || viewAllHref || total > visible.length) && (
        <div className="mt-3 pt-3 text-center">
          {onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              View all ({total}) ›
            </button>
          ) : (
            <Link
              href={viewAllHref ?? "#"}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              View all ({total}) ›
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
