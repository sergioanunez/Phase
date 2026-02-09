"use client"

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { JobRow, type ContractorScheduleEvent } from "./job-row"

export interface ContractorDayCardProps {
  dayLabel: string
  events: ContractorScheduleEvent[]
  onJobClick?: (event: ContractorScheduleEvent) => void
  className?: string
}

export function ContractorDayCard({
  dayLabel,
  events,
  onJobClick,
  className,
}: ContractorDayCardProps) {
  if (events.length === 0) return null

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
    </div>
  )
}
