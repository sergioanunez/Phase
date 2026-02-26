"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { FlowAction } from "@/lib/flow/types"

function buildSentence(action: FlowAction): string {
  const addr = action.homeAddress
  const task = action.taskName
  const when = action.isOverdue ? "ASAP" : "today"
  if (action.type === "EXECUTE") {
    return `${addr}. Start ${task} ${when}.`
  }
  if (action.requiresOrdering) {
    return `${addr}. Order materials for ${task} ${when} to stay on-time.`
  }
  if (action.contractorName) {
    return `${addr}. Schedule ${action.contractorName} for ${task} ${when} to stay on-time.`
  }
  return `${addr}. Schedule/confirm ${task} ${when} to stay on-time.`
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function FlowFeedItem({ action }: { action: FlowAction }) {
  const [expanded, setExpanded] = useState(false)
  const sentence = buildSentence(action)
  const dateLabel =
    action.type === "PREP"
      ? `Prep by ${formatDisplayDate(action.prepStart)}`
      : `Start ${formatDisplayDate(action.forecastStart)}`

  return (
    <article className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-foreground">{action.homeAddress}</p>
        <p className="text-sm text-muted-foreground">{sentence}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              action.type === "EXECUTE"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {action.type}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
            {dateLabel}
          </span>
          {action.isOverdue && (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
              Overdue
            </span>
          )}
        </div>
        {action.type === "PREP" && !action.executionEligible && (
          <p className="text-xs text-muted-foreground">
            Execution locked until dependencies complete.
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
              <dt className="text-muted-foreground">Prep lead</dt>
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
