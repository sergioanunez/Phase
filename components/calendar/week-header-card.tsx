"use client"

import { cn } from "@/lib/utils"

export interface WeekHeaderCardProps {
  dateRange: string
  summary: string
  className?: string
}

export function WeekHeaderCard({
  dateRange,
  summary,
  className,
}: WeekHeaderCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm",
        className
      )}
    >
      <p className="text-base font-semibold text-foreground">{dateRange}</p>
      <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
    </div>
  )
}
