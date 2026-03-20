"use client"

import Link from "next/link"
import { getHomeRisk, type HomeRisk } from "@/lib/flow/briefing"
import type { FlowAction, FlowHomeGroup } from "@/lib/flow/types"

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

export function FlowQueueRow({
  group,
  action,
  onOpenAction,
}: {
  group: FlowHomeGroup
  action: FlowAction
  onOpenAction: (action: FlowAction) => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)

  const isWaitingBlocked = action.state === "WAITING" && !action.executionEligible
  const isInProgress = action.state === "IN_PROGRESS"

  const helperText = isWaitingBlocked
    ? "Waiting on prior task to finish."
    : isInProgress
      ? "In progress."
      : action.type === "PREP"
        ? "Ready to schedule."
        : "Ready to start."

  const actionBadgeText = isWaitingBlocked
    ? "SCHEDULE"
    : action.type === "EXECUTE"
      ? "START WORK"
      : "SCHEDULE"

  const actionBadgeClass =
    action.type === "EXECUTE" && action.executionEligible
      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
      : "bg-amber-50 text-amber-800 border border-amber-200"

  const urgencyText = action.isOverdue ? "Overdue" : action.actionDate === todayStr ? "Today" : null
  const urgencyClass = action.isOverdue
    ? "bg-rose-50 text-rose-700 border border-rose-200"
    : "bg-gray-100 text-gray-600 border border-gray-200"

  const risk = getHomeRisk(group)
  const riskInfo = riskPill(risk)

  const accentClass =
    isWaitingBlocked || action.type === "PREP"
      ? "bg-amber-300"
      : action.type === "EXECUTE" && action.executionEligible
        ? "bg-emerald-300"
        : "bg-gray-300"

  const homeHref = `/homes/${group.homeId}`

  return (
    <div className="rounded-lg border border-border bg-white shadow-sm">
      <div className="flex min-h-[72px] flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-stretch">
        {/* Address block (navigation) */}
        <div className="flex items-start justify-between gap-3 sm:flex-col sm:gap-1 sm:justify-start sm:w-[38%]">
          <Link
            href={homeHref}
            aria-label={`Open home details for ${group.address}`}
            className="min-w-0 cursor-pointer rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <div className="hover:underline hover:underline-offset-2">
              <div className="text-sm font-semibold text-foreground truncate">{group.address}</div>
              {group.communityName && (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{group.communityName}</div>
              )}
            </div>
          </Link>

          {/* Mobile: show home status in top-right */}
          <span
            className={`sm:hidden inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${riskInfo.className}`}
          >
            {riskInfo.label}
          </span>
        </div>

        {/* Task block (primary action) */}
        <button
          type="button"
          onClick={() => onOpenAction(action)}
          aria-label={`Perform action for ${action.taskName}`}
          className="flex flex-1 items-stretch gap-3 rounded-md border-0 bg-transparent px-0 py-0 text-left focus:outline-none focus:ring-2 focus:ring-primary/20 hover:bg-muted/40 active:bg-muted/60"
        >
          <span className={`hidden sm:block w-[3px] rounded-full ${accentClass}`} />
          <div className="min-w-0 flex flex-col justify-center py-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {action.taskName}
              </span>

              {/* Mobile: action + urgency close to the title */}
              <div className="flex gap-2 sm:hidden">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${actionBadgeClass}`}>
                  {actionBadgeText}
                </span>
                {urgencyText && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${urgencyClass}`}>
                    {urgencyText}
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground mt-1">{helperText}</p>
          </div>
        </button>

        {/* Badge group (desktop) */}
        <div className="hidden sm:flex sm:flex-col sm:justify-center sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${actionBadgeClass}`}>
              {actionBadgeText}
            </span>
            {urgencyText && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${urgencyClass}`}>
                {urgencyText}
              </span>
            )}
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${riskInfo.className}`}>
              {riskInfo.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

