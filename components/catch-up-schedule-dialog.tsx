"use client"

import { useEffect, useMemo, useState } from "react"
import { format, startOfDay } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { normalizeStoredScheduledDate } from "@/lib/calendar-date"
import {
  isCatchUpDateInFuture,
  isCatchUpEligibleTask,
  selectTaskIdsUpToAnchor,
} from "@/lib/catch-up-schedule"
import { badgeLabelForTaskStatus } from "@/lib/task-status"
import { cn } from "@/lib/utils"

export type CatchUpScheduleTaskRow = {
  id: string
  nameSnapshot: string
  status: string
  scheduledDate: string | null
  sortOrderSnapshot: number
  isCriticalPath?: boolean
  templateItem?: {
    optionalCategory: string | null
    isCriticalGate?: boolean
  } | null
}

type CatchUpScheduleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  homeId: string
  /** Tasks in display order (flat or per-category flatten). */
  orderedTasks: CatchUpScheduleTaskRow[]
  onSuccess: () => void
}

function formatScheduledDate(iso: string | null): string | null {
  if (!iso) return null
  return format(normalizeStoredScheduledDate(new Date(iso)), "MM/dd/yyyy")
}

export function CatchUpScheduleDialog({
  open,
  onOpenChange,
  homeId,
  orderedTasks,
  onSuccess,
}: CatchUpScheduleDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [anchorTaskId, setAnchorTaskId] = useState<string | null>(null)
  const [completedDate, setCompletedDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [step, setStep] = useState<"select" | "confirm">("select")
  const [loading, setLoading] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)

  const eligibleTasks = useMemo(
    () => orderedTasks.filter((t) => isCatchUpEligibleTask(t.status)),
    [orderedTasks]
  )

  const eligibleIdsOrdered = useMemo(
    () => eligibleTasks.map((t) => t.id),
    [eligibleTasks]
  )

  const tasksByCategory = useMemo(() => {
    const groups = new Map<string, CatchUpScheduleTaskRow[]>()
    for (const task of eligibleTasks) {
      const cat = task.templateItem?.optionalCategory?.trim() || "Uncategorized"
      const list = groups.get(cat) ?? []
      list.push(task)
      groups.set(cat, list)
    }
    return groups
  }, [eligibleTasks])

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set())
      setAnchorTaskId(null)
      setCompletedDate(format(new Date(), "yyyy-MM-dd"))
      setStep("select")
      setLoading(false)
      setDateError(null)
    }
  }, [open])

  const toggleTask = (taskId: string) => {
    setAnchorTaskId(taskId)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(eligibleIdsOrdered))
  }

  const handleClear = () => {
    setSelectedIds(new Set())
    setAnchorTaskId(null)
  }

  const handleSelectToHere = () => {
    if (!anchorTaskId) return
    setSelectedIds(new Set(selectTaskIdsUpToAnchor(eligibleIdsOrdered, anchorTaskId)))
  }

  const validateDate = (): boolean => {
    const d = new Date(`${completedDate}T12:00:00`)
    if (Number.isNaN(d.getTime())) {
      setDateError("Enter a valid date.")
      return false
    }
    if (isCatchUpDateInFuture(d)) {
      setDateError("Completion date cannot be in the future.")
      return false
    }
    setDateError(null)
    return true
  }

  const handleContinue = () => {
    if (selectedIds.size === 0) return
    if (!validateDate()) return
    setStep("confirm")
  }

  const handleApply = async () => {
    if (selectedIds.size === 0 || !validateDate()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/homes/${homeId}/catch-up-schedule`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIds: Array.from(selectedIds),
          completedAt: completedDate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error || "Failed to catch up schedule")
        return
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      alert("Failed to catch up schedule")
    } finally {
      setLoading(false)
    }
  }

  const completedDateLabel = format(
    new Date(`${completedDate}T12:00:00`),
    "MMM d, yyyy"
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>Catch Up Schedule</DialogTitle>
              <p className="text-sm text-muted-foreground pt-1">
                Select the work items already completed in the field.
              </p>
            </DialogHeader>

            {eligibleTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                There are no incomplete work items to catch up.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleClear}>
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectToHere}
                    disabled={!anchorTaskId}
                    title={
                      anchorTaskId
                        ? "Select this task and all previous incomplete items"
                        : "Click a task row first"
                    }
                  >
                    Select to Here
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {selectedIds.size} selected
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto border rounded-md divide-y max-h-[45vh]">
                  {Array.from(tasksByCategory.entries()).map(([category, tasks]) => (
                    <div key={category}>
                      <div className="sticky top-0 bg-muted/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
                        {category.replace(/Prelliminary/gi, "Preliminary")}
                      </div>
                      <ul className="divide-y">
                        {tasks.map((task) => {
                          const scheduled = formatScheduledDate(task.scheduledDate)
                          const isCritical =
                            task.isCriticalPath || task.templateItem?.isCriticalGate
                          return (
                            <li key={task.id}>
                              <label
                                className={cn(
                                  "flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40",
                                  anchorTaskId === task.id && "bg-muted/30"
                                )}
                                onClick={() => setAnchorTaskId(task.id)}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 rounded border-input"
                                  checked={selectedIds.has(task.id)}
                                  onChange={() => toggleTask(task.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium leading-tight">
                                      {task.nameSnapshot}
                                    </span>
                                    {isCritical && (
                                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                        Critical
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                                    {scheduled && <span>Scheduled: {scheduled}</span>}
                                    <span>{badgeLabelForTaskStatus(task.status)}</span>
                                  </div>
                                </div>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Completed on</label>
                  <input
                    type="date"
                    value={completedDate}
                    max={format(startOfDay(new Date()), "yyyy-MM-dd")}
                    onChange={(e) => {
                      setCompletedDate(e.target.value)
                      setDateError(null)
                    }}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                  {dateError && (
                    <p className="text-xs text-destructive mt-1">{dateError}</p>
                  )}
                </div>
              </>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {eligibleTasks.length > 0 && (
                <Button
                  type="button"
                  onClick={handleContinue}
                  disabled={selectedIds.size === 0}
                >
                  Continue
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Mark selected work items completed?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will mark {selectedIds.size} work item{selectedIds.size === 1 ? "" : "s"} as
              completed with completion date {completedDateLabel}. Scheduled dates will remain
              unchanged. No SMS confirmations or reminders will be sent.
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("select")}
                disabled={loading}
              >
                Back
              </Button>
              <Button type="button" onClick={handleApply} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  `Complete ${selectedIds.size} Task${selectedIds.size === 1 ? "" : "s"}`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
