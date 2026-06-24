"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TaskStatus } from "@prisma/client"
import { format } from "date-fns"
import {
  calendarDateInputToIso,
  formatScheduledDateInput,
  normalizeStoredScheduledDate,
} from "@/lib/calendar-date"
import { MessageCircle, CalendarX, Loader2, CheckCircle, PlayCircle } from "lucide-react"
import { RescheduleTaskDialog } from "@/components/reschedule-task-dialog"
import { MarkNotApplicableDialog } from "@/components/mark-not-applicable-dialog"
import { labelForRescheduleReason } from "@/lib/reschedule-reason-labels"
import { labelForNotApplicableReason } from "@/lib/not-applicable-reason-labels"
import { badgeLabelForTaskStatus } from "@/lib/task-status"
import type { TaskRescheduleReason, TaskNotApplicableReason } from "@prisma/client"

interface Contractor {
  id: string
  companyName: string
  phone: string
}

interface Task {
  id: string
  nameSnapshot: string
  status: TaskStatus
  scheduledDate: string | null
  contractorId: string | null
  contractor: {
    id: string
    companyName: string
  } | null
  notes: string | null
  confirmationSource?: "Manual" | "Sms" | null
  lastRescheduleReason?: TaskRescheduleReason | null
  lastRescheduleNote?: string | null
  lastRescheduledAt?: string | null
  lastPreviousScheduledDate?: string | null
  rescheduleCount?: number
  lastRescheduledBy?: { id: string; name: string | null } | null
  reportedCompleteAt?: string | null
  reportedCompleteNote?: string | null
  reportedCompleteBy?: { id: string; name: string | null } | null
  notApplicableReason?: TaskNotApplicableReason | null
  notApplicableNote?: string | null
  notApplicableAt?: string | null
  notApplicableBy?: { id: string; name: string | null } | null
}

interface TaskModalProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
  /** Home address for reschedule confirmation context */
  homeLabel?: string
}

const BUILDER_ROLES_MANUAL_CONFIRM = new Set(["Admin", "Manager", "Superintendent"])
const BUILDER_ROLES_TASK_WRITE = BUILDER_ROLES_MANUAL_CONFIRM

export function TaskModal({ task, open, onOpenChange, onUpdate, homeLabel = "" }: TaskModalProps) {
  const { data: session } = useSession()
  const canManualConfirm = BUILDER_ROLES_MANUAL_CONFIRM.has(session?.user?.role ?? "")
  const canMarkNotApplicable = BUILDER_ROLES_TASK_WRITE.has(session?.user?.role ?? "")
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [scheduledDate, setScheduledDate] = useState(formatScheduledDateInput(task.scheduledDate))
  const [contractorId, setContractorId] = useState(task.contractorId || "")
  const [notes, setNotes] = useState(task.notes || "")
  const [markConfirmedManual, setMarkConfirmedManual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingSMS, setSendingSMS] = useState(false)
  const [currentTask, setCurrentTask] = useState(task)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [markNaDialogOpen, setMarkNaDialogOpen] = useState(false)
  const [revertingApplicable, setRevertingApplicable] = useState(false)

  useEffect(() => {
    fetch("/api/contractors")
      .then((res) => res.json())
      .then((data) => setContractors(data))
  }, [])

  useEffect(() => {
    setCurrentTask(task)
    setScheduledDate(formatScheduledDateInput(task.scheduledDate))
    setContractorId(task.contractorId || "")
    setNotes(task.notes || "")
  }, [task])

  const handleCancelSchedule = async () => {
    const mayNotifyContractor =
      !!currentTask.contractor &&
      (currentTask.status === "Confirmed" ||
        currentTask.status === "PendingConfirm" ||
        currentTask.status === "Scheduled")
    const confirmMessage = mayNotifyContractor
      ? "Cancel schedule? This will remove the scheduled date and contractor assignment, and send a cancellation SMS to the contractor."
      : "Cancel schedule? This will remove the scheduled date and contractor assignment."
    
    if (!confirm(confirmMessage)) {
      return
    }

    setLoading(true)
    try {
      // Use the cancel-schedule endpoint which handles SMS sending
      const res = await fetch(`/api/tasks/${currentTask.id}/cancel-schedule`, {
        method: "POST",
        credentials: "same-origin",
      })

      if (res.ok) {
        const updatedTask = await res.json()
        setCurrentTask(updatedTask)
        setScheduledDate("")
        setContractorId("")
        onUpdate()
        if (mayNotifyContractor) {
          alert("Schedule cancelled and cancellation SMS sent to contractor.")
        }
      } else {
        let message = "Failed to cancel schedule"
        try {
          const data = await res.json()
          if (data?.error && typeof data.error === "string") message = data.error
        } catch {
          message = res.statusText || message
        }
        alert(message)
      }
    } catch (error) {
      console.error("Failed to cancel schedule:", error)
      alert("Failed to cancel schedule")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const updateData: any = {}
      if (scheduledDate) {
        updateData.scheduledDate = calendarDateInputToIso(scheduledDate)
      } else {
        // Explicitly set to null if empty and change status to Unscheduled
        updateData.scheduledDate = null
        // Only change to Unscheduled if the task currently has a scheduled date
        if (task.scheduledDate) {
          updateData.status = "Unscheduled"
        }
      }
      if (contractorId) {
        updateData.contractorId = contractorId
      }
      if (notes !== undefined) {
        updateData.notes = notes
      }
      if (
        canManualConfirm &&
        markConfirmedManual &&
        currentTask.status !== "Confirmed" &&
        currentTask.status !== "Completed"
      ) {
        updateData.confirmManually = true
      }

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        const updatedTask = await res.json()
        setCurrentTask(updatedTask)
        onUpdate()
        // Don't close modal if we just scheduled a task that didn't have a date before - allow user to send SMS
        const justScheduled = !task.scheduledDate && scheduledDate
        if (justScheduled && contractorId) {
          // Just scheduled with contractor, keep modal open so user can send SMS
        } else {
          onOpenChange(false)
        }
      } else {
        let message = "Failed to update task"
        try {
          const data = await res.json()
          if (data?.error && typeof data.error === "string") message = data.error
        } catch {
          message = res.statusText || message
        }
        alert(message)
      }
    } catch (error) {
      console.error("Failed to update task:", error)
      alert("Failed to update task. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSendConfirmation = async () => {
    const effectiveContractorId = contractorId || currentTask.contractorId
    const effectiveScheduledDate =
      scheduledDate || formatScheduledDateInput(currentTask.scheduledDate)
    
    if (!effectiveContractorId || !effectiveScheduledDate) {
      alert("Task must have a contractor and scheduled date")
      return
    }

    setSendingSMS(true)
    try {
      // If task is still Unscheduled (or not yet saved with this date/contractor), save first so send-confirmation can run
      const needsSave =
        currentTask.status === "Unscheduled" ||
        !currentTask.scheduledDate ||
        formatScheduledDateInput(currentTask.scheduledDate) !== effectiveScheduledDate ||
        (currentTask.contractorId || "") !== effectiveContractorId

      if (needsSave) {
        const patchBody: Record<string, unknown> = {
          scheduledDate: calendarDateInputToIso(effectiveScheduledDate),
          contractorId: effectiveContractorId,
          notes: notes !== undefined ? notes : currentTask.notes,
        }
        if (
          canManualConfirm &&
          markConfirmedManual &&
          currentTask.status !== "Confirmed" &&
          currentTask.status !== "Completed"
        ) {
          patchBody.confirmManually = true
        }
        const patchRes = await fetch(`/api/tasks/${currentTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        })
        if (!patchRes.ok) {
          const data = await patchRes.json()
          alert(data.error || "Failed to save schedule")
          return
        }
        const updatedTask = await patchRes.json()
        setCurrentTask(updatedTask)
        setScheduledDate(effectiveScheduledDate)
        setContractorId(effectiveContractorId)
        onUpdate()
      }

      const res = await fetch(`/api/tasks/${currentTask.id}/send-confirmation`, {
        method: "POST",
      })

      if (res.ok) {
        alert("Confirmation SMS sent!")
        const taskRes = await fetch(`/api/tasks/${currentTask.id}`)
        if (taskRes.ok) {
          const updatedTask = await taskRes.json()
          setCurrentTask(updatedTask)
        }
        onUpdate()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to send SMS")
      }
    } catch (error) {
      console.error("Failed to send confirmation:", error)
      alert("Failed to send confirmation SMS")
    } finally {
      setSendingSMS(false)
    }
  }

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${currentTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error || data?.message || "Failed to update status")
        return
      }

      const updatedTask = await res.json()
      setCurrentTask(updatedTask)
      onUpdate()
    } catch (error) {
      console.error("Failed to update status:", error)
      alert(error instanceof Error ? error.message : "Failed to update status")
    } finally {
      setLoading(false)
    }
  }

  const handleMarkApplicable = async () => {
    if (!confirm("Reopen this task for scheduling and completion?")) return
    setRevertingApplicable(true)
    try {
      const res = await fetch(`/api/tasks/${currentTask.id}/mark-applicable`, {
        method: "POST",
        credentials: "same-origin",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error || "Failed to mark task applicable")
        return
      }
      setCurrentTask(data)
      onUpdate()
    } catch (error) {
      console.error(error)
      alert("Failed to mark task applicable")
    } finally {
      setRevertingApplicable(false)
    }
  }

  const isNotApplicable = currentTask.status === "NotApplicable"

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{currentTask.nameSnapshot}</DialogTitle>
          <DialogDescription className="flex flex-col items-start gap-1">
            <Badge
              className={
                isNotApplicable
                  ? "bg-gray-100 text-gray-700 border-gray-200"
                  : undefined
              }
            >
              {badgeLabelForTaskStatus(currentTask.status)}
            </Badge>
            {currentTask.status === "Confirmed" &&
              (currentTask.confirmationSource === "Manual" ||
                currentTask.confirmationSource === "Sms") && (
                <span className="text-xs text-muted-foreground font-normal">
                  {currentTask.confirmationSource === "Manual"
                    ? "Confirmed manually"
                    : "Confirmed via SMS"}
                </span>
              )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isNotApplicable && currentTask.notApplicableReason && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 space-y-1 text-sm">
              <p className="font-medium text-gray-800">Not applicable for this house</p>
              <p className="text-muted-foreground">
                {labelForNotApplicableReason(currentTask.notApplicableReason)}
                {currentTask.notApplicableReason === "other" && currentTask.notApplicableNote
                  ? ` — ${currentTask.notApplicableNote}`
                  : ""}
              </p>
              {(currentTask.notApplicableBy?.name || currentTask.notApplicableAt) && (
                <p className="text-xs text-muted-foreground">
                  {currentTask.notApplicableBy?.name && (
                    <span>By {currentTask.notApplicableBy.name}</span>
                  )}
                  {currentTask.notApplicableAt && (
                    <span>
                      {currentTask.notApplicableBy?.name ? " · " : ""}
                      {format(new Date(currentTask.notApplicableAt), "MMM d, h:mm a")}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Scheduled Date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              disabled={isNotApplicable}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Contractor
            </label>
            <select
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              disabled={isNotApplicable}
            >
              <option value="">Select contractor</option>
              {contractors.map((contractor) => (
                <option key={contractor.id} value={contractor.id}>
                  {contractor.companyName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-md"
              disabled={isNotApplicable}
            />
          </div>

          {currentTask.reportedCompleteAt &&
            currentTask.status !== "Completed" &&
            canManualConfirm && (
              <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-amber-300 bg-white text-amber-900">
                    Reported complete
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Reported by{" "}
                  {currentTask.reportedCompleteBy?.name ??
                    currentTask.contractor?.companyName ??
                    "Contractor"}{" "}
                  · {format(new Date(currentTask.reportedCompleteAt), "MMM d, yyyy h:mm a")}
                </p>
                {currentTask.reportedCompleteNote && (
                  <p className="text-xs text-foreground">
                    <span className="font-medium">Their note:</span> {currentTask.reportedCompleteNote}
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={loading}
                  onClick={() => handleStatusChange("Completed")}
                >
                  Verify & complete
                </Button>
              </div>
            )}

          {currentTask.lastRescheduledAt && currentTask.lastRescheduleReason && (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs space-y-1">
              <p className="font-medium text-foreground">Last reschedule</p>
              {currentTask.lastPreviousScheduledDate && currentTask.scheduledDate && (
                <p>
                  <span className="text-muted-foreground">From:</span>{" "}
                  {format(new Date(currentTask.lastPreviousScheduledDate), "MMM d")}
                  <span className="text-muted-foreground"> → To:</span>{" "}
                  {format(normalizeStoredScheduledDate(new Date(currentTask.scheduledDate)), "MMM d")}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Reason:</span>{" "}
                {labelForRescheduleReason(currentTask.lastRescheduleReason)}
                {currentTask.lastRescheduleReason === "other" && currentTask.lastRescheduleNote
                  ? ` — ${currentTask.lastRescheduleNote}`
                  : ""}
              </p>
              {(currentTask.lastRescheduledBy?.name || currentTask.lastRescheduledAt) && (
                <p className="text-muted-foreground">
                  {currentTask.lastRescheduledBy?.name && (
                    <>
                      <span>By {currentTask.lastRescheduledBy.name}</span>
                      {currentTask.lastRescheduledAt ? " · " : ""}
                    </>
                  )}
                  {currentTask.lastRescheduledAt &&
                    format(new Date(currentTask.lastRescheduledAt), "MMM d, h:mm a")}
                </p>
              )}
            </div>
          )}

          {canManualConfirm &&
            (scheduledDate || currentTask.scheduledDate) &&
            currentTask.status !== "Completed" &&
            currentTask.status !== "Canceled" &&
            !isNotApplicable && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-3 space-y-2">
                {currentTask.status === "Confirmed" ? (
                  <p className="text-sm text-foreground">
                    {currentTask.confirmationSource === "Manual" && "Confirmed manually"}
                    {currentTask.confirmationSource === "Sms" && "Confirmed via SMS"}
                    {currentTask.confirmationSource == null &&
                      "Confirmed"}
                  </p>
                ) : (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-input"
                      checked={markConfirmedManual}
                      onChange={(e) => setMarkConfirmedManual(e.target.checked)}
                      disabled={loading}
                    />
                    <span>
                      <span className="text-sm font-medium">Mark as confirmed</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Use this if the trade already confirmed outside the system.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

          {/* Request confirmation: show as soon as date + contractor are set (form or saved) */}
          {(scheduledDate || currentTask.scheduledDate) && (contractorId || currentTask.contractorId) && (
            <div>
              <Button
                type="button"
                onClick={handleSendConfirmation}
                disabled={sendingSMS || markConfirmedManual}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                title={
                  markConfirmedManual
                    ? "Uncheck Mark as confirmed to send an SMS request instead."
                    : "Save schedule and send a text to the vendor’s default contact"
                }
              >
                {sendingSMS ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <MessageCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="ml-2">
                  {sendingSMS ? "Sending…" : "Request confirmation"}
                </span>
              </Button>
            </div>
          )}

          {/* Schedule actions: only when task has a date */}
          {currentTask.scheduledDate && (currentTask.status === "Scheduled" || currentTask.status === "Confirmed" || currentTask.status === "PendingConfirm") && (
            <div className="flex flex-wrap gap-2">
              {(currentTask.status === "Scheduled" ||
                currentTask.status === "Confirmed" ||
                currentTask.status === "PendingConfirm") && (
                <>
                  <Button
                    onClick={handleCancelSchedule}
                    disabled={loading}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title="Cancel Schedule"
                  >
                    <CalendarX className="h-4 w-4" />
                  </Button>
                  {(currentTask.status === "Scheduled" || currentTask.status === "Confirmed") &&
                    scheduledDate &&
                    scheduledDate !== formatScheduledDateInput(currentTask.scheduledDate) && (
                    <Button
                      onClick={() => setRescheduleDialogOpen(true)}
                      disabled={loading}
                      variant="outline"
                      size="sm"
                      title="Reschedule task to a new date"
                    >
                      Reschedule
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {isNotApplicable && canMarkNotApplicable && (
              <Button
                onClick={handleMarkApplicable}
                disabled={revertingApplicable}
                size="sm"
                variant="outline"
                className="shrink-0"
              >
                {revertingApplicable ? "Reopening…" : "Mark Applicable"}
              </Button>
            )}
            {!isNotApplicable &&
              canMarkNotApplicable &&
              currentTask.status !== "Completed" && (
                <Button
                  onClick={() => setMarkNaDialogOpen(true)}
                  disabled={loading}
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                >
                  Mark N/A
                </Button>
              )}
            {!isNotApplicable &&
              (currentTask.status === "Scheduled" ||
              currentTask.status === "PendingConfirm" ||
              currentTask.status === "Confirmed" ||
              currentTask.status === "InProgress") && (
              <Button
                onClick={() => handleStatusChange("Completed")}
                disabled={loading}
                size="sm"
                className="bg-green-600 hover:bg-green-700 shrink-0 size-9 p-0"
                title={
                  currentTask.reportedCompleteAt ? "Verify & complete" : "Mark Completed"
                }
                aria-label={
                  currentTask.reportedCompleteAt ? "Verify and complete" : "Mark Completed"
                }
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
              </Button>
            )}
            {currentTask.status === "Confirmed" && (
              <Button
                onClick={() => handleStatusChange("InProgress")}
                disabled={loading}
                size="sm"
                variant="outline"
                className="shrink-0 size-9 p-0"
                title="Mark In Progress"
                aria-label="Mark In Progress"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
              </Button>
            )}
            {currentTask.status === "Completed" && (
              <Button
                onClick={() => handleStatusChange("Confirmed")}
                disabled={loading}
                size="sm"
                variant="outline"
                className="shrink-0"
              >
                Mark Not Completed
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || isNotApplicable} size="sm">
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <MarkNotApplicableDialog
      open={markNaDialogOpen}
      onOpenChange={setMarkNaDialogOpen}
      task={currentTask}
      onSuccess={(updated) => {
        setCurrentTask(updated as Task)
        onUpdate()
      }}
    />

    <RescheduleTaskDialog
      open={rescheduleDialogOpen}
      onOpenChange={setRescheduleDialogOpen}
      task={currentTask}
      homeLabel={homeLabel || "Home"}
      newDateStr={
        scheduledDate || formatScheduledDateInput(currentTask.scheduledDate)
      }
      contractorId={contractorId || currentTask.contractorId}
      onSuccess={({ task: updated, smsResent, warnings, reasonLabel }) => {
        const t = updated as Task
        setCurrentTask(t)
        const nextDate =
          t.scheduledDate != null ? formatScheduledDateInput(t.scheduledDate) : ""
        if (nextDate) setScheduledDate(nextDate)
        const dateShown =
          t.scheduledDate != null
            ? format(normalizeStoredScheduledDate(new Date(t.scheduledDate)), "MMM d")
            : nextDate
        let msg = `${t.nameSnapshot} rescheduled to ${dateShown}. Reason: ${reasonLabel}.`
        msg += smsResent ? " Confirmation resent." : ""
        if (warnings.length) msg += "\n\n" + warnings.join("\n")
        alert(msg)
        onUpdate()
      }}
    />
    </>
  )
}
