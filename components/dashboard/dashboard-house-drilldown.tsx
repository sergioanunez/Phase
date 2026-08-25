"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DashboardHouseRow } from "@/components/dashboard/dashboard-house-row"
import {
  DASHBOARD_DRILLDOWN_SEARCH_MIN,
  filterDrilldownHouses,
  type DashboardDrilldownKind,
  type DashboardHouseRowData,
} from "@/lib/dashboard/drilldown"
import { cn } from "@/lib/utils"

const SCROLL_KEY = "phase-dashboard-drilldown-scroll"

export function DashboardHouseDrilldown({
  open,
  onOpenChange,
  title,
  kind,
  houses,
  loading,
  subtitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  kind: DashboardDrilldownKind
  houses: DashboardHouseRowData[]
  loading?: boolean
  /** Overrides the default “N homes” description. */
  subtitle?: string
}) {
  const [query, setQuery] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const saved = sessionStorage.getItem(`${SCROLL_KEY}:${kind}:${title}`)
    if (saved) listRef.current.scrollTop = Number(saved) || 0
  }, [open, kind, title, houses.length])

  const filtered = useMemo(
    () => filterDrilldownHouses(houses, query),
    [houses, query]
  )
  const showSearch = houses.length >= DASHBOARD_DRILLDOWN_SEARCH_MIN
  const countLabel =
    subtitle ??
    (kind === "delays"
      ? `${houses.length} confirmed task${houses.length === 1 ? "" : "s"} not started`
      : `${houses.length} home${houses.length === 1 ? "" : "s"}`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          "fixed bottom-0 left-0 right-0 top-auto max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none",
          "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
          "sm:bottom-auto sm:left-[50%] sm:right-auto sm:top-[50%] sm:max-h-[85vh] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl",
          "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]"
        )}
      >
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="pr-8 text-lg leading-snug">{title}</DialogTitle>
          <DialogDescription className="text-sm">{countLabel}</DialogDescription>
        </DialogHeader>

        {showSearch && (
          <div className="border-b border-border px-4 py-2.5">
            <label htmlFor="dashboard-drilldown-search" className="sr-only">
              Search homes
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="dashboard-drilldown-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search address or subdivision…"
                className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        )}

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          onScroll={(e) => {
            sessionStorage.setItem(
              `${SCROLL_KEY}:${kind}:${title}`,
              String((e.target as HTMLDivElement).scrollTop)
            )
          }}
        >
          {loading ? (
            <ul className="space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className="h-[72px] animate-pulse rounded-xl border border-[#E6E8EF] bg-muted/40"
                />
              ))}
            </ul>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">
              No homes currently match this view.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((house) => (
                <li key={house.homeId} className="min-w-0">
                  <DashboardHouseRow house={house} kind={kind} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
