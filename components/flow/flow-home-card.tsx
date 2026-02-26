"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { FlowAction, FlowHomeGroup } from "@/lib/flow/types"

const DEFAULT_VISIBLE = 2

function actionLabel(action: FlowAction): string {
  if (action.type === "EXECUTE") return `Start ${action.taskName}`
  if (action.requiresOrdering) return `Order materials for ${action.taskName}`
  if (action.contractorName) return `Schedule ${action.contractorName} for ${action.taskName}`
  return `Schedule/confirm ${action.taskName}`
}

function formatDisplayDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function FlowHomeCard({
  group,
  onOpenAction,
}: {
  group: FlowHomeGroup
  onOpenAction: (action: FlowAction) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const visibleCount = expanded ? group.actions.length : Math.min(DEFAULT_VISIBLE, group.actions.length)
  const visibleActions = group.actions.slice(0, visibleCount)
  const hasMore = group.actions.length > DEFAULT_VISIBLE

  return (
    <Card className="overflow-hidden border-border bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{group.address}</h3>
              {group.communityName && (
                <p className="text-xs text-muted-foreground mt-0.5">{group.communityName}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2 sm:mt-0">
              {group.counts.overdue > 0 && (
                <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  Overdue {group.counts.overdue}
                </span>
              )}
              {group.counts.prep > 0 && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                  Prep {group.counts.prep}
                </span>
              )}
              {group.counts.execute > 0 && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Execute {group.counts.execute}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-0">
          <ul className="divide-y divide-border">
            {visibleActions.map((action) => {
              const dateLabel =
                action.type === "PREP"
                  ? `Prep by ${formatDisplayDate(action.prepStart)}`
                  : `Start ${formatDisplayDate(action.forecastStart)}`
              return (
                <li key={`${action.taskInstanceId}-${action.type}`}>
                  <button
                    type="button"
                    onClick={() => onOpenAction(action)}
                    className="w-full text-left px-0 py-3 flex flex-col gap-1.5 rounded-md hover:bg-muted/50 active:bg-muted transition-colors border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          action.type === "EXECUTE"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {action.type}
                      </span>
                      <span className="text-sm text-foreground flex-1 min-w-0">
                        {actionLabel(action)}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {dateLabel}
                      </span>
                      {action.isOverdue && (
                        <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive shrink-0">
                          Overdue
                        </span>
                      )}
                    </div>
                    {action.type === "PREP" && !action.executionEligible && (
                      <p className="text-xs text-muted-foreground">
                        Execution locked until dependencies complete.
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 border-t border-border mt-1"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show all ({group.actions.length})
                </>
              )}
            </button>
          )}
          <div className="pt-3 mt-1 border-t border-border">
            <Link
              href={`/homes/${group.homeId}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View home
            </Link>
          </div>
        </CardContent>
      </Card>
  )
}
