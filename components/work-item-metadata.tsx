"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Calendar, CheckCircle2, Clock, Hammer, Phone } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  buildWorkItemMilestones,
  formatDurationAria,
  formatDurationShort,
  formatMilestoneDateCompact,
  formatMilestoneDateMedium,
  type WorkItemMetadataInput,
  type WorkItemMilestone,
  type WorkItemMilestoneKey,
} from "@/lib/work-item-metadata"

const ICON_CLASS = "h-3 w-3 shrink-0"
const ROW_CLASS = "flex items-center gap-x-1.5 text-xs leading-tight min-w-0"

const MILESTONE_ICONS: Record<WorkItemMilestoneKey, LucideIcon> = {
  called: Phone,
  scheduled: Calendar,
  started: Hammer,
  completed: CheckCircle2,
}

export type WorkItemMetadataProps = WorkItemMetadataInput & {
  className?: string
}

function MilestoneDateText({ date }: { date: Date }) {
  return (
    <>
      <span className="sm:hidden tabular-nums">{formatMilestoneDateCompact(date)}</span>
      <span className="hidden sm:inline tabular-nums">{formatMilestoneDateMedium(date)}</span>
    </>
  )
}

function MilestoneItem({ milestone }: { milestone: WorkItemMilestone }) {
  const Icon = MILESTONE_ICONS[milestone.key]
  const hasDate = milestone.date != null
  const isCompleted = milestone.key === "completed" && hasDate

  const title = hasDate
    ? `${milestone.label} ${formatMilestoneDateMedium(milestone.date!)}`
    : `${milestone.label} — not yet`

  const ariaLabel = hasDate
    ? `${milestone.label} ${formatMilestoneDateMedium(milestone.date!)}`
    : `${milestone.label} not yet`

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 shrink-0 transition-colors duration-300 ease-out",
        hasDate
          ? isCompleted
            ? "text-green-700 dark:text-green-400"
            : "text-foreground/80"
          : "text-muted-foreground/45"
      )}
      title={title}
      aria-label={ariaLabel}
    >
      <Icon className={ICON_CLASS} aria-hidden />
      <span
        className={cn(
          "transition-opacity duration-300 ease-out",
          hasDate ? "opacity-100" : "opacity-70"
        )}
      >
        {hasDate ? <MilestoneDateText date={milestone.date!} /> : "—"}
      </span>
    </span>
  )
}

function RowSeparator() {
  return (
    <span className="text-muted-foreground/40 shrink-0" aria-hidden>
      •
    </span>
  )
}

/**
 * Compact two-row metadata for Work Item cards.
 * Row 1: duration + contractor (+ optional open punches)
 * Row 2: Called → Scheduled → Started → Completed lifecycle
 */
export function WorkItemMetadata({
  durationDays,
  contractorName,
  calledAt,
  scheduledDate,
  startedAt,
  completedAt,
  punchOpenCount,
  className,
}: WorkItemMetadataProps) {
  const durationShort = formatDurationShort(durationDays)
  const durationAria = formatDurationAria(durationDays)
  const contractor = contractorName?.trim() || null
  const punches =
    punchOpenCount != null && punchOpenCount > 0 ? punchOpenCount : null

  const milestones = buildWorkItemMilestones({
    calledAt,
    scheduledDate,
    startedAt,
    completedAt,
  })

  const row1: ReactNode[] = []

  if (durationShort) {
    row1.push(
      <span
        key="duration"
        className="inline-flex items-center gap-1 shrink-0 text-muted-foreground"
        title="Duration"
        aria-label={durationAria ?? undefined}
      >
        <Clock className={ICON_CLASS} aria-hidden />
        <span className="tabular-nums">{durationShort}</span>
      </span>
    )
  }

  if (contractor) {
    row1.push(
      <span
        key="contractor"
        className="truncate min-w-0 text-muted-foreground"
        title={contractor}
      >
        {contractor}
      </span>
    )
  }

  if (punches != null) {
    row1.push(
      <span
        key="punches"
        className="shrink-0 font-medium text-destructive tabular-nums"
        title="Open punches"
        aria-label={`${punches} open punch${punches === 1 ? "" : "es"}`}
      >
        {punches} punch{punches === 1 ? "" : "es"}
      </span>
    )
  }

  return (
    <div className={cn("mt-1 space-y-0.5 min-w-0", className)}>
      {row1.length > 0 && (
        <div className={ROW_CLASS}>
          {row1.map((node, i) => (
            <span key={i} className="contents">
              {i > 0 ? <RowSeparator /> : null}
              {node}
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          ROW_CLASS,
          "flex-nowrap overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
        role="group"
        aria-label="Work item lifecycle"
      >
        {milestones.map((milestone, i) => (
          <span key={milestone.key} className="contents">
            {i > 0 ? (
              <span className="text-muted-foreground/35 shrink-0" aria-hidden>
                •
              </span>
            ) : null}
            <MilestoneItem milestone={milestone} />
          </span>
        ))}
      </div>
    </div>
  )
}
