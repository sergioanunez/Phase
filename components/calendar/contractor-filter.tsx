"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type ContractorFilterOption = {
  id: string
  name: string
  taskCount: number
}

export function ContractorFilterButton({
  active,
  onClick,
  className,
}: {
  active?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Filter by contractor"
      className={cn(
        "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors min-h-[40px]",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-[#E6E8EF] bg-white text-muted-foreground hover:bg-[#F6F7F9]",
        className
      )}
    >
      <span className="hidden sm:inline">Contractor</span>
      <span className="sm:hidden">👷 Contractor</span>
    </button>
  )
}

export function SelectedContractorChip({
  name,
  onClear,
}: {
  name: string
  onClear: () => void
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-foreground">
      <span className="truncate">
        Contractor: <span className="font-medium">{name}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear contractor filter ${name}`}
        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function ContractorPickerSheet({
  open,
  onOpenChange,
  contractors,
  loading,
  selectedId,
  onSelect,
  title = "Contractor",
  showAllOption = true,
  allOptionLabel = "All Contractors",
  countSuffix = "tasks",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractors: ContractorFilterOption[]
  loading?: boolean
  selectedId: string | null
  onSelect: (contractor: ContractorFilterOption | null) => void
  title?: string
  /** When false, selection requires picking a contractor (no clear-all row). */
  showAllOption?: boolean
  allOptionLabel?: string
  /** Shown after the numeric count, e.g. "tasks". Empty string hides the word. */
  countSuffix?: string
}) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contractors
    return contractors.filter((c) => c.name.toLowerCase().includes(q))
  }, [contractors, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
          // Mobile: bottom sheet
          "fixed bottom-0 left-0 right-0 top-auto max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none",
          "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
          // Desktop: centered dialog
          "sm:bottom-auto sm:left-[50%] sm:right-auto sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
          "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]"
        )}
      >
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border px-4 py-3">
          <label htmlFor="calendar-contractor-search" className="sr-only">
            Search contractors
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="calendar-contractor-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contractors..."
              className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {showAllOption ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onSelect(null)
                  onOpenChange(false)
                }}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50",
                  !selectedId && "bg-primary/5 font-medium text-primary"
                )}
              >
                <span>{allOptionLabel}</span>
              </button>
              <div className="mx-4 border-t border-border" />
            </>
          ) : null}

          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No contractors match.
            </p>
          ) : (
            <ul>
              {filtered.map((c) => {
                const selected = selectedId === c.id
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(c)
                        onOpenChange(false)
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50",
                        selected && "bg-primary/5 font-medium text-primary"
                      )}
                    >
                      <span className="min-w-0 truncate">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {c.taskCount}
                        {countSuffix ? ` ${countSuffix}` : ""}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
