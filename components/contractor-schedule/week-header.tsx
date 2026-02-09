"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface WeekHeaderProps {
  weekRange: string
  onPrev: () => void
  onNext: () => void
  className?: string
}

export function WeekHeader({
  weekRange,
  onPrev,
  onNext,
  className,
}: WeekHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-2xl border border-[#E6E8EF] bg-white px-4 py-3 shadow-sm",
        className
      )}
    >
      <button
        type="button"
        onClick={onPrev}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-[#F6F7F9]"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="text-sm font-semibold text-foreground">{weekRange}</span>
      <button
        type="button"
        onClick={onNext}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-[#F6F7F9]"
        aria-label="Next week"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
