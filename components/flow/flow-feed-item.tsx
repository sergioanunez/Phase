"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { FlowAction } from "@/lib/flow/types"
import { getFlowModeLabel } from "@/lib/flow/labels"

function buildSentence(action: FlowAction): string {
  const addr = action.homeAddress
  const task = action.taskName
  const when = action.isOverdue ? "ASAP" : "today"
  if (action.type === "EXECUTE") {
    return `${addr}. Start work on ${task} ${when}.`
  }
  if (action.requiresOrdering) {
    return `${addr}. Order materials for ${task} ${when} to stay on-time.`
  }
  if (action.contractorName) {
    return `${addr}. Confirm schedule for ${task} ${when} to stay on-time.`
  }
  return `${addr}. Get ready for ${task} ${when} to stay on-time.`
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

export function FlowFeedItem({ action }: { action: FlowAction }) {
  const [expanded, setExpanded] = useState(false)
  const sentence = buildSentence(action)
  const dateLabel = formatDateBadge(action)
  const modeLabel = getFlowModeLabel(action.type)

  return (
    <article className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-foreground">{action.homeAddress}</p>
        <p className="text-sm text-muted-foreground">{sentence}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              action.type === "EXECUTE"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {modeLabel.short}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
            {dateLabel}
          </span>
        </div>
        {action.type === "PREP" && !action.executionEligible && (
          <p className="text-xs text-muted-foreground">
            Waiting on prior tasks to finish.
          </p>
        )}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between text-left text-sm text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
        >
          <span>Details</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expanded && (
          <dl className="mt-2 space-y-1.5 text-sm">
            <div>
              <dt className="text-muted-foreground">Forecast start</dt>
              <dd>{formatDisplayDate(action.forecastStart)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Forecast finish</dt>
              <dd>{formatDisplayDate(action.forecastFinish)}</dd>
            </div>
            {action.contractorName && (
              <div>
                <dt className="text-muted-foreground">Contractor</dt>
                <dd>{action.contractorName}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Get ready lead</dt>
              <dd>{action.prepLeadDays} working days</dd>
            </div>
            {action.dependencyStatus && action.dependencyStatus.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Dependencies</dt>
                <dd className="mt-1 space-y-0.5">
                  {action.dependencyStatus.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          d.complete ? "bg-green-500" : "bg-muted-foreground"
                        }`}
                        aria-hidden
                      />
                      <span className={d.complete ? "text-muted-foreground line-through" : ""}>
                        {d.name}
                      </span>
                      <span className="text-muted-foreground">
                        {d.complete ? "Complete" : "Not complete"}
                      </span>
                    </div>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div className="mt-3">
        <Link
          href={`/homes/${action.homeId}?task=${action.taskInstanceId}`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Open home →
        </Link>
      </div>
    </article>
  )
}
