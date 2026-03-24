"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import Link from "next/link"
import { Loader2, Calendar, MessageCircle, Package, Play, ExternalLink } from "lucide-react"
import type { FlowAction } from "@/lib/flow/types"
import { getFlowModeLabel } from "@/lib/flow/labels"

type TaskData = {
  id: string
  nameSnapshot: string
  status: string
  scheduledDate: string | null
  contractorId: string | null
  contractor: { id: string; companyName: string } | null
  notes: string | null
  orderedAt?: string | null
}

function formatDisplayDate(iso: string): string {
  return format(new Date(iso + "T12:00:00"), "MMM d, yyyy")
}

const BUILDER_ROLES_MANUAL_CONFIRM = new Set(["Admin", "Manager", "Superintendent"])

export interface TaskActionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flowAction: FlowAction | null
  onSuccess: () => void
}

export function TaskActionSheet({
  open,
  onOpenChange,
  flowAction,
  onSuccess,
}: TaskActionSheetProps) {
  const { data: session } = useSession()
  const canManualConfirm = BUILDER_ROLES_MANUAL_CONFIRM.has(session?.user?.role ?? "")
  const [task, setTask] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [scheduledDate, setScheduledDate] = useState("")
  const [contractorId, setContractorId] = useState("")
  const [markConfirmedManual, setMarkConfirmedManual] = useState(false)
  const [contractors, setContractors] = useState<Array<{ id: string; companyName: string }>>([])

  useEffect(() => {
    if (!open || !flowAction) return
    setTask(null)
    fetch(`/api/tasks/${flowAction.taskInstanceId}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setTask(data)
          setScheduledDate(
            data.scheduledDate ? format(new Date(data.scheduledDate), "yyyy-MM-dd") : ""
          )
          setContractorId(data.contractorId || "")
        }
      })
      .catch(() => setTask(null))
    fetch("/api/contractors", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setContractors(Array.isArray(data) ? data : []))
      .catch(() => setContractors([]))
  }, [open, flowAction?.taskInstanceId])

  const handleStart = async () => {
    if (!flowAction) return
    setActionLoading("start")
    try {
      const res = await fetch(`/api/tasks/${flowAction.taskInstanceId}/start`, {
        method: "POST",
        credentials: "same-origin",
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        alert(data.error || "Failed to start task")
      }
    } catch {
      alert("Failed to start task")
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkOrdered = async () => {
    if (!flowAction) return
    setActionLoading("ordered")
    try {
      const res = await fetch(`/api/tasks/${flowAction.taskInstanceId}/mark-ordered`, {
        method: "POST",
        credentials: "same-origin",
      })
      if (res.ok) {
        const updated = await res.json()
        setTask(updated)
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        alert(data.error || "Failed to mark ordered")
      }
    } catch {
      alert("Failed to mark ordered")
    } finally {
      setActionLoading(null)
    }
  }

  const handleSaveSchedule = async () => {
    if (!flowAction || !task) return
    setActionLoading("schedule")
    try {
      const body: { scheduledDate?: string; contractorId?: string | null } = {}
      if (scheduledDate) body.scheduledDate = new Date(scheduledDate).toISOString()
      body.contractorId = contractorId || null
      const res = await fetch(`/api/tasks/${flowAction.taskInstanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const updated = await res.json()
        setTask(updated)
        setMarkConfirmedManual(false)
        onSuccess()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to save schedule")
      }
    } catch {
      alert("Failed to save schedule")
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendConfirmation = async () => {
    if (!flowAction) return
    setActionLoading("confirm")
    try {
      const res = await fetch(`/api/tasks/${flowAction.taskInstanceId}/send-confirmation`, {
        method: "POST",
        credentials: "same-origin",
      })
      if (res.ok) {
        alert("Confirmation SMS sent!")
        const taskRes = await fetch(`/api/tasks/${flowAction.taskInstanceId}`)
        if (taskRes.ok) setTask(await taskRes.json())
        onSuccess()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to send confirmation")
      }
    } catch {
      alert("Failed to send confirmation")
    } finally {
      setActionLoading(null)
    }
  }

  if (!flowAction) return null

  const canStart =
    flowAction.type === "EXECUTE" &&
    flowAction.executionEligible &&
    task?.status !== "InProgress" &&
    task?.status !== "Completed"
  const canMarkOrdered =
    flowAction.requiresOrdering && task && !task.orderedAt
  const hasSchedule = task?.scheduledDate
  const canSendConfirm =
    hasSchedule && task?.contractorId && (task?.status === "Scheduled" || task?.status === "PendingConfirm")

  const modeLabel = getFlowModeLabel(flowAction.type)
  const badgeText = flowAction.executionEligible ? modeLabel.short : "SCHEDULE NOW"
  const badgeClass = flowAction.executionEligible
    ? flowAction.type === "EXECUTE"
      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
      : "bg-amber-50 text-amber-800 border border-amber-200"
    : "bg-amber-50 text-amber-800 border border-amber-200"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{flowAction.taskName}</DialogTitle>
        </DialogHeader>

        {!task ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{task.status}</Badge>
              <Badge
                className={badgeClass}
              >
                {badgeText}
              </Badge>
            </div>

            {flowAction.state === "WAITING" && !flowAction.executionEligible && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm font-medium text-amber-800">
                  Blocked from starting until prior tasks are complete.
                </p>
                <p className="mt-1 text-xs text-amber-800/80">
                  You can still schedule below, but starting and completing are locked.
                </p>
                {flowAction.dependencyStatus && flowAction.dependencyStatus.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] font-medium text-amber-800/90">Blocking tasks</p>
                    <ul className="space-y-1">
                      {flowAction.dependencyStatus.map((d) => (
                        <li
                          key={d.name}
                          className="flex items-center justify-between gap-3 text-xs text-amber-900/90"
                        >
                          <span className={d.complete ? "line-through text-amber-900/60" : ""}>{d.name}</span>
                          <span className="shrink-0 text-[11px] text-amber-800/80">
                            {d.complete ? "Done" : "Missing"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <dl className="grid grid-cols-1 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Forecast start</dt>
                <dd>{formatDisplayDate(flowAction.forecastStart)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Get ready by</dt>
                <dd>{formatDisplayDate(flowAction.prepStart)}</dd>
              </div>
              {task.scheduledDate && (
                <div>
                  <dt className="text-muted-foreground">Scheduled</dt>
                  <dd>{formatDisplayDate(task.scheduledDate)}</dd>
                </div>
              )}
              {flowAction.contractorName && (
                <div>
                  <dt className="text-muted-foreground">Contractor</dt>
                  <dd>{flowAction.contractorName}</dd>
                </div>
              )}
            </dl>

            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                {canStart && (
                  <Button
                    size="sm"
                    onClick={handleStart}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "start" ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    ) : (
                      <Play className="h-4 w-4 shrink-0" />
                    )}
                    <span className="ml-2">Start task</span>
                  </Button>
                )}
                {canMarkOrdered && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMarkOrdered}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "ordered" ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    ) : (
                      <Package className="h-4 w-4 shrink-0" />
                    )}
                    <span className="ml-2">Mark ordered</span>
                  </Button>
                )}
                <div className="w-full border-t border-border pt-2 mt-2 space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">Schedule</label>
                  <div className="flex flex-wrap gap-2 items-end">
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="flex-1 min-w-[140px] px-2 py-1.5 border rounded-md text-sm"
                    />
                    <select
                      value={contractorId}
                      onChange={(e) => setContractorId(e.target.value)}
                      className="flex-1 min-w-[140px] px-2 py-1.5 border rounded-md text-sm"
                    >
                      <option value="">Select contractor</option>
                      {contractors.map((c) => (
                        <option key={c.id} value={c.id}>{c.companyName}</option>
                      ))}
                    </select>
                  </div>
                  {canManualConfirm &&
                    (scheduledDate || task.scheduledDate) &&
                    task.status !== "Completed" &&
                    task.status !== "Canceled" && (
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                        {task.status === "Confirmed" ? (
                          <p className="text-xs text-foreground">
                            {task.confirmationSource === "Manual" && "Confirmed manually"}
                            {task.confirmationSource === "Sms" && "Confirmed via SMS"}
                            {task.confirmationSource == null && "Confirmed"}
                          </p>
                        ) : (
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-input"
                              checked={markConfirmedManual}
                              onChange={(e) => setMarkConfirmedManual(e.target.checked)}
                              disabled={!!actionLoading}
                            />
                            <span>
                              <span className="text-xs font-medium">Mark as confirmed</span>
                              <span className="block text-[11px] text-muted-foreground mt-0.5">
                                Use this if the trade already confirmed outside the system.
                              </span>
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveSchedule}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === "schedule" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Calendar className="h-4 w-4" />
                      )}
                      <span className="ml-2">Schedule</span>
                    </Button>
                    {canSendConfirm && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSendConfirmation}
                        disabled={!!actionLoading || markConfirmedManual}
                        title={
                          markConfirmedManual
                            ? "Uncheck Mark as confirmed to send an SMS request instead."
                            : undefined
                        }
                      >
                        {actionLoading === "confirm" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageCircle className="h-4 w-4" />
                        )}
                        <span className="ml-2">Send confirmation</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href={`/homes/${flowAction.homeId}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                View home
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
