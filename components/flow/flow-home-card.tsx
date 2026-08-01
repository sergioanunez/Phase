"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { FlowAction, FlowHomeGroup } from "@/lib/flow/types"
import { getHomeRisk, type HomeRisk } from "@/lib/flow/briefing"

const DEFAULT_VISIBLE = 2

function formatDateBadge(action: FlowAction): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)

  if (action.isOverdue) return "Overdue"
  if (action.actionDate === todayStr) return "Today"

  const d = new Date(action.actionDate + "T12:00:00")
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return `By ${label}`
}

function riskPill(risk: HomeRisk): { label: string; className: string } {
  switch (risk) {
    case "OVERDUE":
      return {
        label: "Overdue",
        className: "bg-rose-50 text-rose-700 border border-rose-200",
      }
    case "AT_RISK":
      return {
        label: "At Risk",
        className: "bg-amber-50 text-amber-700 border border-amber-200",
      }
    default:
      return {
        label: "On Track",
        className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      }
  }
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

  const risk = getHomeRisk(group)
  const riskInfo = riskPill(risk)

  return (
    <Card className="overflow-hidden border-border bg-white shadow-sm">
      <CardHeader className="pb-0">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/homes/${group.homeId}`}
            aria-label={`Open home details for ${group.address}`}
            className="group cursor-pointer"
          >
            <h3 className="font-semibold text-foreground group-hover:underline group-hover:underline-offset-2">
              {group.address}
            </h3>
            {group.communityName && (
              <p className="text-xs text-muted-foreground mt-0.5 group-hover:text-foreground/80">
                {group.communityName}
              </p>
            )}
          </Link>
          <div className="mt-2 sm:mt-0">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${riskInfo.className}`}
            >
              {riskInfo.label}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-0">
        <ul className="divide-y divide-border">
          {visibleActions.map((action) => {
            const dateLabel = formatDateBadge(action)
            const overdueBorderClass = action.isOverdue
              ? action.type === "PREP"
                ? "border-l-4 border-l-amber-400"
                : "border-l-4 border-l-rose-400"
              : "border-l border-l-transparent"
            const isWaitingBlocked = action.state === "WAITING" && !action.executionEligible
            const isInProgress = action.state === "IN_PROGRESS"

            const actionBadgeText = isWaitingBlocked
              ? "SCHEDULE NOW"
              : action.type === "EXECUTE"
                ? "START WORK"
                : "SCHEDULE"

            const badgeClass =
              isWaitingBlocked || action.type === "PREP"
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200"

            const helperText = isWaitingBlocked
              ? "Waiting on prior task to finish."
              : isInProgress
                ? "In progress."
                : action.type === "PREP"
                  ? "Ready to schedule."
                  : "Ready to start."

            return (
              <li key={`${action.taskInstanceId}-${action.type}`}>
                <button
                  type="button"
                  onClick={() => onOpenAction(action)}
                  aria-label={`Flow action: ${action.taskName}`}
                  className={`w-full text-left px-0 py-1.25 flex flex-col gap-1 rounded-md hover:bg-muted/50 active:bg-muted transition-colors border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset cursor-pointer ${overdueBorderClass}`}
                >
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-sm font-semibold text-foreground flex-1 min-w-0">
                      {action.taskName}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      {actionBadgeText}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground shrink-0">
                      {dateLabel}
                    </span>
                  </div>
                  <p className="text-[11px] leading-tight text-muted-foreground">{helperText}</p>
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
      </CardContent>
    </Card>
  )
}

