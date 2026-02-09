"use client"

import { cn } from "@/lib/utils"

export type CalendarViewMode = "day" | "week" | "month"

export interface SegmentedControlProps {
  value: CalendarViewMode
  onChange: (value: CalendarViewMode) => void
  options: { value: CalendarViewMode; label: string }[]
  className?: string
}

export function SegmentedControl({
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex rounded-xl border border-[#E6E8EF] bg-[#F6F7F9] p-1 shadow-sm",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "min-h-[40px] min-w-[72px] rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
