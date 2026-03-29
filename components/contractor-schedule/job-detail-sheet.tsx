"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { ClipboardList, Mail, MessageSquare } from "lucide-react"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { getAppBaseUrl, openWhatsAppShare, openEmailShare, openSMSShare } from "@/lib/share/whatsapp"
import { cn } from "@/lib/utils"
import type { ContractorScheduleEvent } from "./job-row"

export interface JobDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: ContractorScheduleEvent | null
  /** Refetch schedule after report / undo so lists and chips stay in sync. */
  onScheduleRefresh?: () => void | Promise<void>
}

export function JobDetailSheet({
  open,
  onOpenChange,
  event,
  onScheduleRefresh,
}: JobDetailSheetProps) {
  const [taskNote, setTaskNote] = useState("")
  const [punchNotes, setPunchNotes] = useState<Record<string, string>>({})
  const [showTaskReportForm, setShowTaskReportForm] = useState(false)
  const [punchReportId, setPunchReportId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setTaskNote("")
      setPunchNotes({})
      setShowTaskReportForm(false)
      setPunchReportId(null)
      setBusy(false)
    }
  }, [open, event?.id])

  if (!event) return null

  const taskCompleted = event.status === "completed"
  const taskReportedPending = !!(event.reportedCompleteAt && !taskCompleted)

  const refresh = async () => {
    await onScheduleRefresh?.()
  }

  const buildShareMessage = (): string => {
    const lines: string[] = []

    lines.push(event.title)
    lines.push("")

    lines.push("Address: " + event.address)
    if (event.communityName) {
      lines.push(event.communityName)
    }

    const dateLabel = format(new Date(event.date), "EEEE, MMMM d, yyyy")
    lines.push("Date: " + dateLabel)

    if (event.updatedAt) {
      lines.push(
        "Last updated: " + format(new Date(event.updatedAt), "MMM d, yyyy h:mm a")
      )
    }

    if (event.notes) {
      lines.push("")
      lines.push("Notes:")
      lines.push(event.notes)
    }

    if (event.punchItems && event.punchItems.length > 0) {
      lines.push("")
      lines.push(`Punch list (${event.punchItems.length} item${event.punchItems.length === 1 ? "" : "s"}):`)
      event.punchItems.forEach((p) => {
        const tags = [p.status, p.severity].filter(Boolean).join(" · ")
        lines.push(`• ${p.title}${tags ? " (" + tags + ")" : ""}`)
      })
    }

    if (event.homeId && event.workItemId) {
      const base = getAppBaseUrl()
      if (base) {
        lines.push("")
        lines.push("View in Phase: " + `${base}/homes/${event.homeId}/tasks/${event.workItemId}`)
      }
    }

    return lines.join("\n")
  }

  const handleShareWhatsApp = () => {
    const text = buildShareMessage()
    openWhatsAppShare(text)
    if (typeof window !== "undefined") {
      console.log("share_whatsapp_subcontractor_job", {
        homeId: event.homeId,
        workItemId: event.workItemId,
        punchCount: event.punchItems?.length ?? 0,
      })
    }
  }

  const handleShareSMS = () => {
    const text = buildShareMessage()
    openSMSShare(text)
    if (typeof window !== "undefined") {
      console.log("share_sms_subcontractor_job", {
        homeId: event.homeId,
        workItemId: event.workItemId,
        punchCount: event.punchItems?.length ?? 0,
      })
    }
  }

  const handleShareEmail = () => {
    const text = buildShareMessage()
    openEmailShare(text, event.title)
    if (typeof window !== "undefined") {
      console.log("share_email_subcontractor_job", {
        homeId: event.homeId,
        workItemId: event.workItemId,
        punchCount: event.punchItems?.length ?? 0,
      })
    }
  }

  const submitTaskReport = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/subcontractor/tasks/${event.workItemId}/report-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: taskNote.trim() || undefined }),
        credentials: "same-origin",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Failed to report")
      setShowTaskReportForm(false)
      setTaskNote("")
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to report")
    } finally {
      setBusy(false)
    }
  }

  const undoTaskReport = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/subcontractor/tasks/${event.workItemId}/undo-report-complete`, {
        method: "POST",
        credentials: "same-origin",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Failed to undo")
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to undo")
    } finally {
      setBusy(false)
    }
  }

  const submitPunchReport = async (punchId: string) => {
    const note = (punchNotes[punchId] ?? "").trim()
    setBusy(true)
    try {
      const res = await fetch(`/api/subcontractor/punch/${punchId}/report-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || undefined }),
        credentials: "same-origin",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Failed to report")
      setPunchReportId(null)
      setPunchNotes((prev) => {
        const next = { ...prev }
        delete next[punchId]
        return next
      })
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to report")
    } finally {
      setBusy(false)
    }
  }

  const undoPunchReport = async (punchId: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/subcontractor/punch/${punchId}/undo-report-complete`, {
        method: "POST",
        credentials: "same-origin",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Failed to undo")
      await refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to undo")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border-[#E6E8EF] p-0">
        <DialogHeader className="border-b border-[#E6E8EF] px-4 py-3 pr-14 sm:pr-16 flex flex-row items-start sm:items-center justify-between gap-2">
          <DialogTitle
            className={cn(
              "text-lg font-semibold min-w-0 flex-1 pr-2 text-left leading-snug",
              taskReportedPending && "line-through text-muted-foreground"
            )}
          >
            {event.title}
          </DialogTitle>
          <div className="flex shrink-0 gap-1.5 pt-0.5 sm:pt-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={handleShareWhatsApp}
              title="Share via WhatsApp"
              aria-label="Share via WhatsApp"
            >
              <WhatsAppIcon className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={handleShareEmail}
              title="Share via email"
              aria-label="Share via email"
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={handleShareSMS}
              title="Send via SMS"
              aria-label="Send via SMS"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {taskReportedPending && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                Reported
              </Badge>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={undoTaskReport}>
                Undo report
              </Button>
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Address
            </p>
            <p className="mt-1 text-sm font-medium">{event.address}</p>
            {event.communityName && (
              <p className="text-sm text-muted-foreground">{event.communityName}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Date
            </p>
            <p className="mt-1 text-sm font-medium">
              {format(new Date(event.date), "EEEE, MMMM d, yyyy")}
            </p>
          </div>
          {event.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 text-sm">{event.notes}</p>
            </div>
          )}
          {event.updatedAt && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last updated
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {format(new Date(event.updatedAt), "MMM d, yyyy h:mm a")}
              </p>
            </div>
          )}

          {!taskCompleted && (
            <div className="rounded-lg border border-[#E6E8EF] bg-slate-50/80 px-3 py-3 space-y-2">
              {!taskReportedPending && !showTaskReportForm && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={() => setShowTaskReportForm(true)}
                >
                  Report complete
                </Button>
              )}
              {!taskReportedPending && showTaskReportForm && (
                <>
                  <label className="text-xs font-medium text-muted-foreground">
                    Optional note for the builder
                  </label>
                  <textarea
                    value={taskNote}
                    onChange={(e) => setTaskNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Add context (optional)"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={busy} onClick={submitTaskReport}>
                      {busy ? "Sending…" : "Submit report"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setShowTaskReportForm(false)
                        setTaskNote("")
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {event.punchItems && event.punchItems.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Punch list ({event.punchItems.length})
              </p>
              <ul className="mt-2 space-y-2">
                {event.punchItems.map((p) => {
                  const punchReported = !!p.reportedCompleteAt
                  const showingForm = punchReportId === p.id
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "rounded-lg border border-[#E6E8EF] bg-gray-50/80 px-3 py-2 text-sm space-y-2",
                        punchReported && "opacity-80"
                      )}
                    >
                      <span
                        className={cn(
                          "font-medium text-foreground block",
                          punchReported && "line-through text-muted-foreground"
                        )}
                      >
                        {p.title}
                      </span>
                      <div className="flex flex-wrap gap-1 items-center">
                        <Badge variant="outline" className="text-xs">
                          {p.status}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {p.severity}
                        </Badge>
                        {punchReported && (
                          <Badge variant="secondary" className="text-xs">
                            Reported
                          </Badge>
                        )}
                      </div>
                      {punchReported ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={busy}
                          onClick={() => undoPunchReport(p.id)}
                        >
                          Undo punch report
                        </Button>
                      ) : !showingForm ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={busy}
                          onClick={() => setPunchReportId(p.id)}
                        >
                          Report complete
                        </Button>
                      ) : (
                        <>
                          <textarea
                            value={punchNotes[p.id] ?? ""}
                            onChange={(e) =>
                              setPunchNotes((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            rows={2}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Optional note"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => submitPunchReport(p.id)}
                            >
                              Submit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => setPunchReportId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
