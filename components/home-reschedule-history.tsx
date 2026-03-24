"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { labelForRescheduleReason } from "@/lib/reschedule-reason-labels"
import type { TaskRescheduleReason } from "@prisma/client"

type Row = {
  id: string
  previousScheduledDate: string
  newScheduledDate: string
  reason: TaskRescheduleReason
  note: string | null
  smsResent: boolean
  createdAt: string
  task: { id: string; nameSnapshot: string }
  rescheduledBy: { id: string; name: string | null }
}

interface HomeRescheduleHistoryProps {
  homeId: string
  refreshKey?: number
}

export function HomeRescheduleHistory({ homeId, refreshKey = 0 }: HomeRescheduleHistoryProps) {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/homes/${homeId}/reschedule-history?limit=50`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.items) return
        setItems(data.items)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [homeId, refreshKey])

  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm mb-4">
        <h2 className="text-base font-semibold text-foreground mb-1">Reschedule history</h2>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm mb-4">
      <h2 className="text-base font-semibold text-foreground mb-1">Reschedule history</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Schedule changes logged for analytics and follow-up.
      </p>
      <ul className="space-y-3">
        {items.map((row) => {
          const from = format(new Date(row.previousScheduledDate), "MMM d")
          const to = format(new Date(row.newScheduledDate), "MMM d")
          const at = format(new Date(row.createdAt), "MMM d, h:mm a")
          const reasonLabel = labelForRescheduleReason(row.reason)
          const by = row.rescheduledBy?.name?.trim() || "Unknown"
          return (
            <li
              key={row.id}
              className="text-sm border-b border-border/60 pb-3 last:border-0 last:pb-0"
            >
              <div className="font-medium text-foreground">{row.task.nameSnapshot}</div>
              <div className="text-muted-foreground mt-0.5">
                {from} → {to}
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground">Reason:</span> {reasonLabel}
                {row.reason === "other" && row.note ? (
                  <span className="text-foreground"> — {row.note}</span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                By {by} · {at}
                {row.smsResent ? " · SMS resent" : ""}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
