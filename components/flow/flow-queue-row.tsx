"use client"

import Link from "next/link"
import { getHomeRisk, type HomeRisk } from "@/lib/flow/briefing"
import type { FlowAction, FlowHomeGroup } from "@/lib/flow/types"

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

export function FlowQueueRow({
  group,
  action,
  exiting,
  onOpenAction,
}: {
  group: FlowHomeGroup
  action: FlowAction
  exiting?: boolean
  onOpenAction: (action: FlowAction) => void
}) {
  const risk = getHomeRisk(group)
  const riskInfo = riskPill(risk)
  const homeHref = `/homes/${group.homeId}`
  const scheduleLabel = action.actionLabel ?? `Schedule ${action.taskName}`

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-out ${
        exiting
          ? "max-h-0 opacity-0 -translate-y-1 scale-[0.98] pointer-events-none"
          : "max-h-40 opacity-100 translate-y-0 scale-100"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenAction(action)}
        aria-label={`${scheduleLabel} at ${group.address}`}
        className="w-full rounded-lg border border-border bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20 active:bg-muted/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={homeHref}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open home details for ${group.address}`}
              className="block min-w-0 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <div className="truncate text-base font-semibold text-foreground hover:underline hover:underline-offset-2">
                {group.address}
              </div>
              {group.communityName && (
                <div className="mt-0.5 truncate text-sm text-muted-foreground">
                  {group.communityName}
                </div>
              )}
            </Link>

            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next action
              </div>
              <div className="mt-0.5 text-sm font-semibold text-foreground">{scheduleLabel}</div>
            </div>
          </div>

          <span
            className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${riskInfo.className}`}
          >
            {riskInfo.label}
          </span>
        </div>
      </button>
    </div>
  )
}
