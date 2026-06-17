"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { GenerateScheduleMode } from "@/lib/homes/generate-schedule"

type PreviewRow = {
  taskId: string
  taskName: string
  category: string | null
  contractorName: string | null
  status: string
  currentScheduledDate: string | null
  proposedStart: string
  proposedFinish: string
  durationDays: number
  isCritical: boolean
}

type SchedulePreview = {
  mode: GenerateScheduleMode
  modeLabel: string
  anchorDate: string
  proposedCount: number
  completedSkipped: number
  proposedFirstDate: string | null
  proposedCompletionDate: string | null
  totalWorkingDays: number
  rows: PreviewRow[]
  warnings: string[]
  error?: string
  defaultAnchorDate?: string
  home?: {
    id: string
    addressOrLot: string
    subdivisionName: string | null
    planName: string | null
    planVariant: string | null
  }
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return format(new Date(), "yyyy-MM-dd")
  return iso.slice(0, 10)
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return format(new Date(iso), "MMM d, yyyy")
}

function datesDiffer(current: string | null, proposed: string): boolean {
  if (!current) return true
  return current.slice(0, 10) !== proposed.slice(0, 10)
}

export function GenerateScheduleCard({
  homeId,
  canGenerate,
  onApplied,
}: {
  homeId: string
  canGenerate: boolean
  onApplied: () => void
}) {
  const [anchorDate, setAnchorDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [mode, setMode] = useState<GenerateScheduleMode>("critical")
  const [preview, setPreview] = useState<SchedulePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)

  const loadDefaults = useCallback(async () => {
    try {
      const res = await fetch(`/api/homes/${homeId}/generate-schedule/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "critical" }),
      })
      const data = await res.json()
      if (res.ok && data.defaultAnchorDate) {
        setAnchorDate(toInputDate(data.defaultAnchorDate))
      }
    } catch {
      // keep today
    } finally {
      setDefaultsLoaded(true)
    }
  }, [homeId])

  useEffect(() => {
    if (canGenerate && !defaultsLoaded) {
      void loadDefaults()
    }
  }, [canGenerate, defaultsLoaded, loadDefaults])

  const handleGeneratePreview = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/homes/${homeId}/generate-schedule/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorDate, mode }),
      })
      const data = (await res.json()) as SchedulePreview & { error?: string }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to generate preview")
        setPreview(null)
        return
      }
      if (data.error) {
        setError(data.error)
      } else {
        setError(null)
      }
      setPreview(data)
    } catch {
      setError("Failed to generate preview")
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!preview || preview.rows.length === 0) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch(`/api/homes/${homeId}/generate-schedule/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorDate, mode: preview.mode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to apply schedule")
        return
      }
      setApplyOpen(false)
      setPreview(null)
      onApplied()
    } catch {
      setError("Failed to apply schedule")
    } finally {
      setApplying(false)
    }
  }

  const handleCancelPreview = () => {
    setPreview(null)
    setError(null)
  }

  const milestoneRows = useMemo(
    () => preview?.rows.filter((r) => r.isCritical) ?? [],
    [preview]
  )

  const handleExportPdf = () => {
    if (!preview?.home) return
    const generatedAt = format(new Date(), "MMM d, yyyy")
    const model = [preview.home.planName, preview.home.planVariant].filter(Boolean).join(" · ")

    const tableRows = preview.rows
      .map(
        (row) => `
      <tr>
        <td>${escapeHtml(row.taskName)}</td>
        <td>${escapeHtml(row.category ?? "—")}</td>
        <td>${escapeHtml(row.contractorName ?? "—")}</td>
        <td>${formatDisplayDate(row.currentScheduledDate)}</td>
        <td>${formatDisplayDate(row.proposedStart)}</td>
        <td>${formatDisplayDate(row.proposedFinish)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>`
      )
      .join("")

    const milestoneSection =
      milestoneRows.length > 0
        ? `<h2>Milestones / Critical Tasks</h2>
      <ul>${milestoneRows.map((r) => `<li>${escapeHtml(r.taskName)} — ${formatDisplayDate(r.proposedStart)}</li>`).join("")}</ul>`
        : ""

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>House Schedule Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 20px 0 8px; }
    .meta { color: #444; margin-bottom: 16px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f3f3; }
    .note { margin-top: 20px; font-size: 11px; color: #555; }
    @media print { body { margin: 12px; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>House Schedule Preview</h1>
  <div class="meta">
    <div><strong>${escapeHtml(preview.home.addressOrLot)}</strong></div>
    ${preview.home.subdivisionName ? `<div>Community: ${escapeHtml(preview.home.subdivisionName)}</div>` : ""}
    ${model ? `<div>Model: ${escapeHtml(model)}</div>` : ""}
    <div>Generated: ${generatedAt}</div>
    <div>Mode: ${escapeHtml(preview.modeLabel)}</div>
    <div>Start: ${formatDisplayDate(preview.anchorDate)}</div>
    <div>Projected completion: ${formatDisplayDate(preview.proposedCompletionDate)}</div>
    <div>${preview.proposedCount} tasks proposed · ${preview.completedSkipped} completed skipped · ${preview.totalWorkingDays} working days</div>
  </div>
  <h2>Summary</h2>
  <p>${preview.proposedCount} task(s) in this proposed schedule. ${preview.completedSkipped} completed task(s) were excluded.</p>
  ${milestoneSection}
  <h2>Proposed Schedule</h2>
  <table>
    <thead>
      <tr>
        <th>Task</th>
        <th>Category</th>
        <th>Contractor</th>
        <th>Current</th>
        <th>Proposed Start</th>
        <th>Proposed Finish</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="note">Completed tasks were excluded from this generated schedule.</p>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

    const win = window.open("", "_blank", "noopener,noreferrer")
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  if (!canGenerate) return null

  return (
    <>
      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="text-base font-semibold text-foreground">Generate schedule</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create a proposed schedule for this home.
          </p>

          {!preview ? (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="schedule-anchor-date" className="text-sm font-medium">
                  Start scheduling from
                </label>
                <input
                  id="schedule-anchor-date"
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  className="mt-1.5 flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              <fieldset>
                <legend className="text-sm font-medium">Generate schedule for</legend>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="schedule-mode"
                      checked={mode === "critical"}
                      onChange={() => setMode("critical")}
                    />
                    Critical tasks only
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="schedule-mode"
                      checked={mode === "all"}
                      onChange={() => setMode("all")}
                    />
                    All remaining tasks
                  </label>
                </div>
              </fieldset>

              <p className="text-xs text-muted-foreground">Completed tasks will not be changed.</p>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="button" onClick={() => void handleGeneratePreview()} disabled={loading}>
                {loading ? "Generating…" : "Generate Preview"}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Schedule Preview</h3>
                {preview.error ? (
                  <p className="mt-2 text-sm text-destructive">{preview.error}</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">{preview.proposedCount}</span>{" "}
                      tasks proposed
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{preview.completedSkipped}</span>{" "}
                      completed tasks skipped
                    </li>
                    <li>Mode: {preview.modeLabel}</li>
                    <li>Start: {formatDisplayDate(preview.anchorDate)}</li>
                    <li>
                      Projected completion: {formatDisplayDate(preview.proposedCompletionDate)}
                    </li>
                    {preview.totalWorkingDays > 0 && (
                      <li>{preview.totalWorkingDays} total working days</li>
                    )}
                  </ul>
                )}
              </div>

              {preview.rows.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="p-2 font-medium">Task</th>
                        <th className="p-2 font-medium hidden sm:table-cell">Category</th>
                        <th className="p-2 font-medium hidden md:table-cell">Contractor</th>
                        <th className="p-2 font-medium">Current</th>
                        <th className="p-2 font-medium">Proposed</th>
                        <th className="p-2 font-medium hidden sm:table-cell">Finish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => {
                        const changed = datesDiffer(row.currentScheduledDate, row.proposedStart)
                        return (
                          <tr key={row.taskId} className="border-b last:border-0 align-top">
                            <td className="p-2">
                              <div className="font-medium">{row.taskName}</div>
                              <div className="text-xs text-muted-foreground sm:hidden">
                                {row.category ?? "—"}
                              </div>
                            </td>
                            <td className="p-2 hidden sm:table-cell text-muted-foreground">
                              {row.category ?? "—"}
                            </td>
                            <td className="p-2 hidden md:table-cell text-muted-foreground">
                              {row.contractorName ?? "—"}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {formatDisplayDate(row.currentScheduledDate)}
                            </td>
                            <td
                              className={cn(
                                "p-2",
                                changed && "font-medium text-primary"
                              )}
                            >
                              {formatDisplayDate(row.proposedStart)}
                            </td>
                            <td className="p-2 hidden sm:table-cell text-muted-foreground">
                              {formatDisplayDate(row.proposedFinish)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {preview.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={preview.rows.length === 0 || applying}
                  onClick={() => setApplyOpen(true)}
                >
                  Apply Schedule
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={preview.rows.length === 0}
                  onClick={handleExportPdf}
                >
                  Export PDF
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancelPreview}>
                  Schedule manually
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply generated schedule?</DialogTitle>
            <DialogDescription>
              This will update scheduled dates for {preview?.proposedCount ?? 0} incomplete task
              {(preview?.proposedCount ?? 0) === 1 ? "" : "s"}. Completed tasks will not be changed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={applying} onClick={() => void handleApply()}>
              {applying ? "Applying…" : "Apply Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
