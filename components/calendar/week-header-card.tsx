"use client"

import { cn } from "@/lib/utils"

export interface WeekHeaderCardProps {
  dateRange: string
  summary: string
  atRiskCount?: number
  className?: string
}

export function WeekHeaderCard({
  dateRange,
  summary,
  atRiskCount = 0,
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
      <p className="mt-1 text-sm text-muted-foreground">
        {summary}
        {atRiskCount > 0 && (
          <span className="ml-1 font-medium text-destructive">
            • {atRiskCount} at risk
          </span>
        )}
      </p>
    </div>
  )
}
