"use client"

import { cn } from "@/lib/utils"

export interface FilterChip {
  id: string
  label: string
}

export interface FilterChipsRowProps {
  chips: FilterChip[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  className?: string
}

export function FilterChipsRow({
  chips,
  selectedId,
  onSelect,
  className,
}: FilterChipsRowProps) {
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 pt-2 scrollbar-thin",
        "scrollbar-thumb-[#E6E8EF] scrollbar-track-transparent",
        className
      )}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {chips.map((chip) => {
        const isSelected = selectedId === chip.id
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onSelect(isSelected ? null : chip.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors min-h-[40px]",
              isSelected
                ? "bg-primary text-primary-foreground"
                : "border border-[#E6E8EF] bg-white text-muted-foreground hover:bg-[#F6F7F9]"
            )}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
