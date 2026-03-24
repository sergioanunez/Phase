"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Loader2 } from "lucide-react"
import {
  TASK_RESCHEDULE_REASON_OPTIONS,
  labelForRescheduleReason,
} from "@/lib/reschedule-reason-labels"
import type { TaskRescheduleReason } from "@prisma/client"

type TaskShape = {
  id: string
  nameSnapshot: string
  scheduledDate: string | null
  contractorId: string | null
}

interface RescheduleTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: TaskShape
  homeLabel: string
  /** yyyy-MM-dd new target date (from scheduling field) */
  newDateStr: string
  contractorId: string | null
  onSuccess: (payload: {
    task: unknown
    smsResent: boolean
    warnings: string[]
    reasonLabel: string
  }) => void
}

export function RescheduleTaskDialog({
  open,
  onOpenChange,
  task,
  homeLabel,
  newDateStr,
  contractorId,
  onSuccess,
}: RescheduleTaskDialogProps) {
  const [reason, setReason] = useState<TaskRescheduleReason | null>(null)
  const [note, setNote] = useState("")
  const [resendSms, setResendSms] = useState(false)
  const [canSendSms, setCanSendSms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [eligibilityLoaded, setEligibilityLoaded] = useState(false)

  useEffect(() => {
    if (!open) {
      setReason(null)
      setNote("")
      setResendSms(false)
      setCanSendSms(false)
      setEligibilityLoaded(false)
      return
    }

    let cancelled = false
    setEligibilityLoaded(false)
    fetch(`/api/tasks/${task.id}/reschedule-eligibility`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setCanSendSms(Boolean(data.canSendSms))
        setResendSms(Boolean(data.defaultResendSms))
        setEligibilityLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setEligibilityLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, task.id])

  const currentDateStr = task.scheduledDate
    ? format(new Date(task.scheduledDate), "yyyy-MM-dd")
    : ""
  const currentLabel = task.scheduledDate
    ? format(new Date(task.scheduledDate), "MMM d")
    : "—"
  const newLabel = newDateStr ? format(new Date(`${newDateStr}T12:00:00`), "MMM d") : "—"

  const canSubmit =
    Boolean(newDateStr) &&
    newDateStr !== currentDateStr &&
    reason != null &&
    (reason !== "other" || note.trim().length > 0)

  const submit = async () => {
    if (!canSubmit || !reason) return
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          scheduledDate: new Date(`${newDateStr}T12:00:00`).toISOString(),
          contractorId: contractorId ?? null,
          reason,
          note: reason === "other" ? note.trim() : null,
          resendSms: resendSms,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof data?.error === "string"
            ? data.error
            : "Failed to reschedule task"
        alert(msg)
        return
      }

      const reasonLabel = labelForRescheduleReason(reason)
      onSuccess({
        task: data.task,
        smsResent: Boolean(data.smsResent),
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        reasonLabel,
      })
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      alert("Failed to reschedule task")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 space-y-1">
            <p>
              <span className="text-muted-foreground">Task:</span>{" "}
              <span className="font-medium text-foreground">{task.nameSnapshot}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Home:</span>{" "}
              <span className="font-medium text-foreground">{homeLabel}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Current date:</span>{" "}
              <span className="font-medium text-foreground">{currentLabel}</span>
            </p>
            <p>
              <span className="text-muted-foreground">New date:</span>{" "}
              <span className="font-medium text-foreground">{newLabel}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Why is this being rescheduled?</label>
            <div className="flex flex-wrap gap-2">
              {TASK_RESCHEDULE_REASON_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={reason === opt.value ? "default" : "outline"}
                  className="rounded-full h-8 text-xs"
                  onClick={() => setReason(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {reason === "other" && (
            <div>
              <label className="block text-sm font-medium mb-1">Add reason</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add reason"
                rows={2}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          )}

          <div className="rounded-md border border-border px-3 py-2.5 space-y-1">
            <label className={`flex items-start gap-2 ${canSendSms ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
              <input
                type="checkbox"
                className="mt-1 rounded border-input"
                checked={resendSms && canSendSms}
                onChange={(e) => setResendSms(e.target.checked)}
                disabled={!eligibilityLoaded || loading || !canSendSms}
              />
              <span>
                <span className="font-medium text-foreground">Resend SMS confirmation to contractor</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Use this if the contractor needs a new confirmation request for the updated date.
                  {!canSendSms && eligibilityLoaded
                    ? " SMS resend requires SMS permission and an eligible contractor contact."
                    : ""}
                </span>
              </span>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Rescheduling…
              </>
            ) : (
              "Reschedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
