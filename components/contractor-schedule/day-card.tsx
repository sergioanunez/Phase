"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { JobRow, type ContractorScheduleEvent } from "./job-row"

export interface ContractorDayCardProps {
  dayLabel: string
  events: ContractorScheduleEvent[]
  /** Shown collapsed under “Reported complete” (tenant not verified yet). */
  reportedEvents?: ContractorScheduleEvent[]
  onJobClick?: (event: ContractorScheduleEvent) => void
  className?: string
}

export function ContractorDayCard({
  dayLabel,
  events,
  reportedEvents = [],
  onJobClick,
  className,
}: ContractorDayCardProps) {
  const [reportedOpen, setReportedOpen] = useState(false)
  if (events.length === 0 && reportedEvents.length === 0) return null

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm",
        className
      )}
    >
      {dayLabel ? (
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold text-foreground">{dayLabel}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      {events.length > 0 && (
        <ul className="space-y-1">
          {events.map((event) => (
            <li key={event.id}>
              <JobRow
                event={event}
                onClick={onJobClick ? () => onJobClick(event) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      {reportedEvents.length > 0 && (
        <div className={cn(events.length > 0 && "mt-3 border-t border-[#E6E8EF] pt-3")}>
          <button
            type="button"
            onClick={() => setReportedOpen((o) => !o)}
            className="mb-2 flex w-full items-center justify-between text-left text-sm font-medium text-muted-foreground"
          >
            <span>
              Reported complete ({reportedEvents.length}) — awaiting builder
            </span>
            {reportedOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>
          {reportedOpen && (
            <ul className="space-y-1">
              {reportedEvents.map((event) => (
                <li key={event.id}>
                  <JobRow
                    event={event}
                    onClick={onJobClick ? () => onJobClick(event) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
