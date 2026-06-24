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
import { Loader2 } from "lucide-react"
import type { TaskNotApplicableReason } from "@prisma/client"
import { TASK_NOT_APPLICABLE_REASON_OPTIONS } from "@/lib/not-applicable-reason-labels"

type TaskShape = {
  id: string
  nameSnapshot: string
}

interface MarkNotApplicableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: TaskShape
  onSuccess: (task: unknown) => void
}

export function MarkNotApplicableDialog({
  open,
  onOpenChange,
  task,
  onSuccess,
}: MarkNotApplicableDialogProps) {
  const [reason, setReason] = useState<TaskNotApplicableReason | null>(null)
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setReason(null)
      setNote("")
      setLoading(false)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!reason) return
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/not-applicable`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          note: reason === "other" ? note.trim() || null : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error || "Failed to mark task not applicable")
        return
      }
      onSuccess(data)
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      alert("Failed to mark task not applicable")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark task as not applicable?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This task will be skipped for this house. It will not count as incomplete or overdue.
        </p>
        <div className="space-y-2">
          <p className="text-sm font-medium">Reason</p>
          <div className="space-y-2">
            {TASK_NOT_APPLICABLE_REASON_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-2 cursor-pointer text-sm"
              >
                <input
                  type="radio"
                  name="not-applicable-reason"
                  className="mt-1"
                  checked={reason === opt.value}
                  onChange={() => setReason(opt.value)}
                  disabled={loading}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {reason === "other" && (
            <textarea
              className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
            />
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !reason}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              "Mark Not Applicable"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
