"use client"

import { useState, useEffect } from "react"
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
import { MessageCircle, CalendarX, Loader2 } from "lucide-react"

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
}

interface TaskModalProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function TaskModal({ task, open, onOpenChange, onUpdate }: TaskModalProps) {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [scheduledDate, setScheduledDate] = useState(
    task.scheduledDate ? format(new Date(task.scheduledDate), "yyyy-MM-dd") : ""
  )
  const [contractorId, setContractorId] = useState(task.contractorId || "")
  const [notes, setNotes] = useState(task.notes || "")
  const [loading, setLoading] = useState(false)
  const [sendingSMS, setSendingSMS] = useState(false)
  const [currentTask, setCurrentTask] = useState(task)

  useEffect(() => {
    fetch("/api/contractors")
      .then((res) => res.json())
      .then((data) => setContractors(data))
  }, [])

  useEffect(() => {
    setCurrentTask(task)
    setScheduledDate(task.scheduledDate ? format(new Date(task.scheduledDate), "yyyy-MM-dd") : "")
    setContractorId(task.contractorId || "")
    setNotes(task.notes || "")
  }, [task])

  const handleCancelSchedule = async () => {
    const willSendSMS = currentTask.status === "Confirmed" && currentTask.contractor
    const confirmMessage = willSendSMS
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
        if (willSendSMS) {
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
        updateData.scheduledDate = new Date(scheduledDate).toISOString()
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
    const effectiveScheduledDate = scheduledDate || (currentTask.scheduledDate ? format(new Date(currentTask.scheduledDate), "yyyy-MM-dd") : "")
    
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
        (currentTask.scheduledDate ? format(new Date(currentTask.scheduledDate), "yyyy-MM-dd") : "") !== effectiveScheduledDate ||
        (currentTask.contractorId || "") !== effectiveContractorId

      if (needsSave) {
        const patchRes = await fetch(`/api/tasks/${currentTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduledDate: new Date(effectiveScheduledDate).toISOString(),
            contractorId: effectiveContractorId,
            notes: notes !== undefined ? notes : currentTask.notes,
          }),
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

      if (res.ok) {
        const updatedTask = await res.json()
        setCurrentTask(updatedTask)
        onUpdate()
      }
    } catch (error) {
      console.error("Failed to update status:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleReschedule = async () => {
    const effectiveScheduledDate = scheduledDate || (currentTask.scheduledDate ? format(new Date(currentTask.scheduledDate), "yyyy-MM-dd") : "")
    const effectiveContractorId = contractorId || currentTask.contractorId || ""
    
    if (!effectiveScheduledDate) {
      alert("Please select a new scheduled date")
      return
    }

    // Check if date actually changed
    const currentDateStr = currentTask.scheduledDate ? format(new Date(currentTask.scheduledDate), "yyyy-MM-dd") : ""
    if (effectiveScheduledDate === currentDateStr) {
      alert("Please select a different date to reschedule")
      return
    }

    if (!confirm(`Reschedule task to ${effectiveScheduledDate}?${currentTask.status === "Confirmed" ? " The task status will change to Scheduled and you can send a new confirmation SMS." : ""}`)) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${currentTask.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledDate: new Date(effectiveScheduledDate).toISOString(),
          contractorId: effectiveContractorId || null,
        }),
      })

      if (res.ok) {
        const updatedTask = await res.json()
        setCurrentTask(updatedTask)
        setScheduledDate(effectiveScheduledDate)
        onUpdate()
        alert("Task rescheduled successfully!")
      } else {
        const data = await res.json()
        alert(data.error || "Failed to reschedule task")
      }
    } catch (error) {
      console.error("Failed to reschedule task:", error)
      alert("Failed to reschedule task")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{currentTask.nameSnapshot}</DialogTitle>
          <DialogDescription>
            <Badge>{currentTask.status}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Scheduled Date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
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
            />
          </div>

          {/* Request confirmation: show as soon as date + contractor are set (form or saved) */}
          {(scheduledDate || currentTask.scheduledDate) && (contractorId || currentTask.contractorId) && (
            <div>
              <Button
                type="button"
                onClick={handleSendConfirmation}
                disabled={sendingSMS}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                title="Save schedule (if needed) and send a text to the contractor to request confirmation"
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
              {(currentTask.status === "Scheduled" || currentTask.status === "Confirmed") && (
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
                  {scheduledDate &&
                    scheduledDate !== (currentTask.scheduledDate ? format(new Date(currentTask.scheduledDate), "yyyy-MM-dd") : "") && (
                    <Button
                      onClick={handleReschedule}
                      disabled={loading}
                      variant="outline"
                      size="sm"
                      title="Reschedule task to a new date"
                    >
                      {loading ? "Rescheduling..." : "Reschedule"}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {(currentTask.status === "Scheduled" ||
              currentTask.status === "PendingConfirm" ||
              currentTask.status === "Confirmed" ||
              currentTask.status === "InProgress") && (
              <Button
                onClick={() => handleStatusChange("Completed")}
                disabled={loading}
                size="sm"
                className="bg-green-600 hover:bg-green-700 shrink-0"
              >
                {loading ? "Saving..." : "Mark Completed"}
              </Button>
            )}
            {currentTask.status === "Confirmed" && (
              <Button
                onClick={() => handleStatusChange("InProgress")}
                disabled={loading}
                size="sm"
                variant="outline"
                className="shrink-0"
              >
                Mark In Progress
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
            <Button onClick={handleSave} disabled={loading} size="sm">
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
