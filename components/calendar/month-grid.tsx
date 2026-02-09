"use client"

import { cn } from "@/lib/utils"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns"

export interface MonthGridProps {
  current: Date
  eventsByDate: Record<string, number>
  onSelectDay: (date: Date) => void
  className?: string
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function MonthGrid({
  current,
  eventsByDate,
  onSelectDay,
  className,
}: MonthGridProps) {
  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const rows: Date[] = []
  let d = new Date(calStart)
  while (d <= calEnd) {
    rows.push(new Date(d))
    d = addDays(d, 1)
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm",
        className
      )}
    >
      <p className="mb-3 text-center text-sm font-semibold text-foreground">
        {format(current, "MMMM yyyy")}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1.5 text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {rows.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const count = eventsByDate[key] ?? 0
          const inMonth = isSameMonth(day, current)
          const today = isToday(day)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center rounded-xl text-sm transition-colors",
                inMonth ? "text-foreground" : "text-muted-foreground/60",
                today && "bg-primary/10 font-semibold text-primary",
                "hover:bg-muted/50"
              )}
            >
              <span>{format(day, "d")}</span>
              {count > 0 && (
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
