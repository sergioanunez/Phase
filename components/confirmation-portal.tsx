"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { normalizeStoredScheduledDate } from "@/lib/calendar-date"

export type ConfirmationPortalItem = {
  taskId: string
  address: string
  taskName: string
  scheduledDate: string | null
  tradeName: string | null
  status: "pending" | "Confirmed" | "Declined"
}

type Props = {
  token: string
  companyName: string
  initialItems: ConfirmationPortalItem[]
}

function formatSched(iso: string | null): string {
  if (!iso) return "—"
  try {
    return format(normalizeStoredScheduledDate(new Date(iso)), "MMM d, yyyy")
  } catch {
    return "—"
  }
}

export function ConfirmationPortal({ token, companyName, initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmAllBusy, setConfirmAllBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = useMemo(() => items.filter((i) => i.status === "pending"), [items])

  const respond = async (taskId: string, action: "confirm" | "unavailable") => {
    setError(null)
    setBusyId(taskId)
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not update confirmation")
        return
      }
      setItems((prev) =>
        prev.map((item) =>
          item.taskId === taskId
            ? {
                ...item,
                status: action === "confirm" ? "Confirmed" : "Declined",
              }
            : item
        )
      )
    } catch {
      setError("Could not update confirmation. Please try again.")
    } finally {
      setBusyId(null)
    }
  }

  const confirmAll = async () => {
    if (pending.length === 0) return
    const ok = window.confirm(
      `Confirm all ${pending.length} pending work item${pending.length === 1 ? "" : "s"}?`
    )
    if (!ok) return
    setError(null)
    setConfirmAllBusy(true)
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(token)}/confirm-all`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not confirm all")
        return
      }
      setItems((prev) =>
        prev.map((item) =>
          item.status === "pending" ? { ...item, status: "Confirmed" } : item
        )
      )
    } catch {
      setError("Could not confirm all. Please try again.")
    } finally {
      setConfirmAllBusy(false)
    }
  }

  if (items.length === 0 || pending.length === 0) {
    const allAnswered = items.length > 0 && pending.length === 0
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="text-sm font-semibold text-muted-foreground mb-1">{companyName}</p>
        <h1 className="text-2xl font-bold text-foreground mb-4">Pending confirmations</h1>
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <p className="text-lg text-foreground">
            {allAnswered ? "All confirmations submitted." : "All confirmations submitted."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 pb-24">
      <p className="text-sm font-semibold text-muted-foreground mb-1">{companyName}</p>
      <h1 className="text-2xl font-bold text-foreground mb-1">Pending confirmations</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Review each work item and respond. No login required.
      </p>

      {error && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {pending.length > 1 && (
        <div className="mb-4">
          <Button
            type="button"
            className="w-full"
            onClick={confirmAll}
            disabled={confirmAllBusy || busyId != null}
          >
            {confirmAllBusy ? "Confirming…" : `Confirm all (${pending.length})`}
          </Button>
        </div>
      )}

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.taskId} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="font-semibold text-foreground">{item.address || "Home"}</p>
            <p className="text-sm text-foreground mt-0.5">{item.taskName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Scheduled: {formatSched(item.scheduledDate)}
              {item.tradeName ? ` · ${item.tradeName}` : ""}
            </p>

            {item.status === "pending" ? (
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={busyId != null || confirmAllBusy}
                  onClick={() => respond(item.taskId, "confirm")}
                >
                  {busyId === item.taskId ? "Saving…" : "Confirm"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={busyId != null || confirmAllBusy}
                  onClick={() => respond(item.taskId, "unavailable")}
                >
                  Unavailable
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                {item.status === "Confirmed" ? "Confirmed" : "Marked unavailable"}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
