"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { canOpenDrilldown } from "@/lib/dashboard/drilldown"
import {
  delaySeverity,
  type DelaysContractorGroup,
  type DelaysTrackerResult,
} from "@/lib/dashboard/delays-tracker"

export interface DelaysTrackerCardProps {
  delays: DelaysTrackerResult
  onContractorSelect?: (group: DelaysContractorGroup) => void
}

export function DelaysTrackerCard({
  delays,
  onContractorSelect,
}: DelaysTrackerCardProps) {
  const { summary, contractors } = delays

  return (
    <Card className="rounded-2xl border-[#E6E8EF] bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Delays Tracker</CardTitle>
        <p className="text-sm text-muted-foreground">
          Confirmed work that should already be underway.
        </p>
      </CardHeader>
      <CardContent>
        {contractors.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No confirmed work is currently delayed.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {summary.delayedTaskCount} delayed task
              {summary.delayedTaskCount === 1 ? "" : "s"}
              {" · "}
              {summary.contractorCount} contractor
              {summary.contractorCount === 1 ? "" : "s"}
              {" · "}
              {summary.homeCount} home{summary.homeCount === 1 ? "" : "s"}
            </p>
            <ul className="space-y-1">
              {contractors.map((group) => {
                const interactive = canOpenDrilldown(group.delayCount)
                const severity = delaySeverity(group.oldestDaysDelayed)
                return (
                  <li key={group.contractorId}>
                    <button
                      type="button"
                      disabled={!interactive}
                      aria-label={`View ${group.delayCount} delayed tasks for ${group.contractorName}`}
                      onClick={() => onContractorSelect?.(group)}
                      className={cn(
                        "flex min-h-[48px] w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                        interactive
                          ? "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          : "cursor-default opacity-50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {group.contractorName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {group.delayCount} delayed task
                          {group.delayCount === 1 ? "" : "s"}
                          {group.oldestDaysDelayed > 0 ? (
                            <>
                              {" · "}
                              <span
                                className={
                                  severity === "red" ? "text-red-700" : "text-amber-800"
                                }
                              >
                                Oldest: {group.oldestDaysDelayed} working day
                                {group.oldestDaysDelayed === 1 ? "" : "s"}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {group.delayCount}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
