"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { FlowAction, FlowHomeGroup } from "@/lib/flow/types"
import { getFlowModeLabel } from "@/lib/flow/labels"
import { getHomeRisk, type HomeRisk } from "@/lib/flow/briefing"

const DEFAULT_VISIBLE = 2

function actionLabel(action: FlowAction): string {
  if (action.actionLabel) return action.actionLabel
  if (action.type === "EXECUTE") return `Start work: ${action.taskName}`
  if (action.requiresOrdering) return `Order materials: ${action.taskName}`
  if (action.contractorName) return `Confirm schedule: ${action.taskName}`
  return `Get ready: ${action.taskName}`
}

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
    case "NOT_STARTED":
      return {
        label: "Not started",
        className: "bg-gray-100 text-gray-600 border border-gray-200",
      }
    case "SLIPPING":
      return {
        label: "Slipping",
        className: "bg-rose-50 text-rose-700 border border-rose-200",
      }
    case "AT_RISK":
      return {
        label: "At risk",
        className: "bg-amber-50 text-amber-700 border border-amber-200",
      }
    default:
      return {
        label: "On track",
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
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">{group.address}</h3>
            {group.communityName && (
              <p className="text-xs text-muted-foreground mt-0.5">{group.communityName}</p>
            )}
            {group.actions.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {group.actions.length} item{group.actions.length > 1 ? "s" : ""} need attention
              </p>
            )}
          </div>
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
            const modeLabel = getFlowModeLabel(action.type)
            const dateLabel = formatDateBadge(action)
            const overdueBorderClass = action.isOverdue
              ? action.type === "PREP"
                ? "border-l-4 border-l-amber-400"
                : "border-l-4 border-l-rose-400"
              : "border-l border-l-transparent"
            return (
              <li key={`${action.taskInstanceId}-${action.type}`}>
                <button
                  type="button"
                  onClick={() => onOpenAction(action)}
                  className={`w-full text-left px-0 py-2 flex flex-col gap-1.5 rounded-md hover:bg-muted/50 active:bg-muted transition-colors border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset ${overdueBorderClass}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        action.type === "EXECUTE"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {modeLabel.short}
                    </span>
                    <span className="text-sm text-foreground flex-1 min-w-0">
                      {actionLabel(action)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground shrink-0">
                      {dateLabel}
                    </span>
                  </div>
                  {action.type === "PREP" && !action.executionEligible && (
                    <p className="text-xs text-muted-foreground">
                      Waiting on prior tasks to finish.
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
            href={
              group.actions[0]?.actionCta?.taskId
                ? `/homes/${group.homeId}?task=${group.actions[0].actionCta.taskId}`
                : `/homes/${group.homeId}`
            }
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {group.actions[0]?.actionCta ? "Open task" : "View home"}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

