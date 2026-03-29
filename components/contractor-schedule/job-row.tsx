"use client"

import { ChevronRight, CheckCircle2, Circle, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ContractorScheduleEventPunchItem {
  id: string
  title: string
  status: string
  severity: string
  reportedCompleteAt?: string | null
}

export interface ContractorScheduleEvent {
  id: string
  date: string
  title: string
  address: string
  communityName?: string
  homeId?: string
  workItemId: string
  status?: "scheduled" | "completed" | "canceled" | "delayed"
  tenantId?: string
  tenantName?: string
  notes?: string | null
  updatedAt?: string
  punchOpenCount?: number
  punchItems?: ContractorScheduleEventPunchItem[]
  reportedCompleteAt?: string | null
}

export interface JobRowProps {
  event: ContractorScheduleEvent
  onClick?: () => void
  className?: string
}

function isReportedPendingVerification(event: ContractorScheduleEvent): boolean {
  return !!(event.reportedCompleteAt && event.status !== "completed")
}

export function JobRow({ event, onClick, className }: JobRowProps) {
  const reportedPending = isReportedPendingVerification(event)
  const statusIcon =
    event.status === "completed" ? (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
    ) : reportedPending ? (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
    ) : (
      <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    )

  const punchCount = event.punchOpenCount ?? event.punchItems?.length ?? 0

  const content = (
    <>
      {statusIcon}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium text-foreground",
            reportedPending && "line-through text-muted-foreground"
          )}
        >
          {event.title}
        </p>
        <p className="text-sm text-muted-foreground">{event.address}</p>
        {event.tenantName && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {event.tenantName}
            </span>
          </p>
        )}
        {reportedPending && (
          <p className="mt-0.5">
            <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              Reported
            </span>
          </p>
        )}
        {punchCount > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            {punchCount} open punch{punchCount !== 1 ? "es" : ""}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  )

  const rowClass = cn(
    "flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/50",
    reportedPending && "opacity-75",
    className
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClass} style={{ width: "100%" }}>
        {content}
      </button>
    )
  }

  return <div className={rowClass}>{content}</div>
}
