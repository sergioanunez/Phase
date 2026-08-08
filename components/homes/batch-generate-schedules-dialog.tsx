"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react"
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

type CategoryOption = { id: string; name: string; itemCount: number }

type BatchHomePreview = {
  homeId: string
  addressOrLot: string
  statusLabel: string | null
  orderIndex: number
  anchorDate: string
  applyCount: number
  ready: boolean
  needsReview: boolean
  preview: {
    proposedCount: number
    blockedCount: number
    proposedCompletionDate: string | null
    sourceFingerprint: string
    error?: string
    warnings: string[]
    rows: Array<{
      taskId: string
      taskName: string
      category: string | null
      currentScheduledDate: string | null
      proposedStart: string | null
      proposedFinish: string | null
      durationDays: number
      isCritical: boolean
      blocked?: boolean
      blockedReason?: string | null
      preservedExisting?: boolean
    }>
  }
}

type BatchPreview = {
  mode: GenerateScheduleMode
  modeLabel: string
  category: string | null
  categoryLabel: string
  respectExistingScheduledDates: boolean
  scheduleBehaviorLabel: string
  baseAnchorDate: string
  staggerWorkingDays: number
  houseCount: number
  readyCount: number
  reviewCount: number
  totalProposedTasks: number
  totalApplyTasks: number
  homes: BatchHomePreview[]
  subdivision?: { id: string; name: string }
}

export type BatchHomeOption = {
  id: string
  addressOrLot: string
  statusLabel?: string | null
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return format(new Date(iso), "MMM d, yyyy")
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return format(new Date(iso), "MMM d")
}

export function BatchGenerateSchedulesDialog({
  open,
  onOpenChange,
  subdivisionId,
  subdivisionName,
  homes,
  canGenerate,
  onApplied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subdivisionId: string
  subdivisionName: string
  /** Homes in saved display order */
  homes: BatchHomeOption[]
  canGenerate: boolean
  onApplied?: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [orderedSelectedIds, setOrderedSelectedIds] = useState<string[]>([])
  const [baseAnchorDate, setBaseAnchorDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [staggerWorkingDays, setStaggerWorkingDays] = useState(2)
  const [customStagger, setCustomStagger] = useState("")
  const [staggerMode, setStaggerMode] = useState<"preset" | "custom">("preset")
  const [mode, setMode] = useState<GenerateScheduleMode>("critical")
  const [respectExisting, setRespectExisting] = useState(true)
  const [categoryScope, setCategoryScope] = useState<"all" | "one">("all")
  const [category, setCategory] = useState("")
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [preview, setPreview] = useState<BatchPreview | null>(null)
  const [expandedHomeId, setExpandedHomeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const ids = homes.map((h) => h.id)
    setSelectedIds(ids)
    setOrderedSelectedIds(ids)
    setPreview(null)
    setError(null)
    setResultMessage(null)
    setExpandedHomeId(null)
    fetch("/api/settings/work-template-categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CategoryOption[]) =>
        setCategories(
          Array.isArray(rows) ? rows.filter((c) => (c.itemCount ?? 0) > 0) : []
        )
      )
      .catch(() => setCategories([]))
  }, [open, homes])

  const homeById = useMemo(() => new Map(homes.map((h) => [h.id, h])), [homes])

  const orderedSelected = useMemo(
    () => orderedSelectedIds.filter((id) => selectedIds.includes(id)),
    [orderedSelectedIds, selectedIds]
  )

  const effectiveStagger =
    staggerMode === "custom"
      ? Math.max(0, parseInt(customStagger || "0", 10) || 0)
      : staggerWorkingDays

  const toggleHome = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
    setOrderedSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setPreview(null)
  }

  const selectAll = () => {
    const ids = homes.map((h) => h.id)
    setSelectedIds(ids)
    setOrderedSelectedIds(ids)
    setPreview(null)
  }

  const clearAll = () => {
    setSelectedIds([])
    setPreview(null)
  }

  const moveSelected = (id: string, dir: -1 | 1) => {
    setOrderedSelectedIds((prev) => {
      const list = prev.filter((x) => selectedIds.includes(x))
      const idx = list.indexOf(id)
      if (idx < 0) return prev
      const j = idx + dir
      if (j < 0 || j >= list.length) return prev
      const next = [...list]
      ;[next[idx], next[j]] = [next[j]!, next[idx]!]
      // Keep unselected ids after
      const rest = prev.filter((x) => !selectedIds.includes(x))
      return [...next, ...rest]
    })
    setPreview(null)
  }

  const handleGeneratePreview = async () => {
    if (!canGenerate || orderedSelected.length === 0) return
    if (categoryScope === "one" && !category) {
      setError("Select a work-item category")
      return
    }
    setLoading(true)
    setError(null)
    setResultMessage(null)
    try {
      const res = await fetch(
        `/api/subdivisions/${subdivisionId}/generate-schedules/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homeIds: orderedSelected,
            baseAnchorDate,
            staggerWorkingDays: effectiveStagger,
            mode,
            respectExistingScheduledDates: respectExisting,
            category: categoryScope === "one" ? category : null,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Preview failed")
        setPreview(null)
        return
      }
      setPreview(data as BatchPreview)
    } catch {
      setError("Preview failed")
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!preview || !canGenerate) return
    setApplying(true)
    setError(null)
    try {
      const fingerprints: Record<string, string> = {}
      for (const h of preview.homes) {
        fingerprints[h.homeId] = h.preview.sourceFingerprint
      }
      const res = await fetch(
        `/api/subdivisions/${subdivisionId}/generate-schedules/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homeIds: orderedSelected,
            baseAnchorDate,
            staggerWorkingDays: effectiveStagger,
            mode,
            respectExistingScheduledDates: respectExisting,
            category: categoryScope === "one" ? category : null,
            fingerprints,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Apply failed")
        return
      }
      setApplyOpen(false)
      setResultMessage(
        `Schedules applied · ${data.appliedHomes} house${data.appliedHomes === 1 ? "" : "s"} · ${data.tasksUpdated} tasks · ${data.staggerWorkingDays}-day stagger`
      )
      const stale = (data.results ?? []).filter(
        (r: { status: string }) => r.status === "stale" || r.status === "error"
      )
      if (stale.length > 0) {
        setError(
          `${stale.length} house${stale.length === 1 ? "" : "s"} need review (stale or failed).`
        )
      }
      setPreview(null)
      onApplied?.()
    } catch {
      setError("Apply failed")
    } finally {
      setApplying(false)
    }
  }

  const handleExportPdf = useCallback(() => {
    if (!preview) return
    const html = buildBatchExportHtml(preview, subdivisionName)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, "_blank")
    if (!w) {
      setError("Pop-up blocked — allow pop-ups to print/export.")
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, [preview, subdivisionName])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(92vh,900px)] w-full max-w-[min(56rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle>Generate Schedules</DialogTitle>
                <DialogDescription>
                  {subdivisionName} · configure → preview → apply
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            {/* Step 1 — houses */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">1. Select houses</h3>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
                    Clear All
                  </Button>
                </div>
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {homes.map((h) => {
                  const checked = selectedIds.includes(h.id)
                  return (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleHome(h.id)}
                        className="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{h.addressOrLot}</p>
                        {h.statusLabel ? (
                          <p className="text-xs text-muted-foreground">{h.statusLabel}</p>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* Session order */}
            {orderedSelected.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">House order (for stagger)</h3>
                <p className="text-xs text-muted-foreground">
                  Session order only — does not change the subdivision’s saved sequence.
                </p>
                <ol className="space-y-1.5">
                  {orderedSelected.map((id, index) => {
                    const h = homeById.get(id)
                    if (!h) return null
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="w-6 text-xs text-muted-foreground">{index + 1}.</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{h.addressOrLot}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          disabled={index === 0}
                          onClick={() => moveSelected(id, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          disabled={index === orderedSelected.length - 1}
                          onClick={() => moveSelected(id, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}

            {/* Config */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold">2. First house starts</label>
                <input
                  type="date"
                  value={baseAnchorDate}
                  onChange={(e) => {
                    setBaseAnchorDate(e.target.value)
                    setPreview(null)
                  }}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  3. Stagger house starts by
                </label>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      variant={
                        staggerMode === "preset" && staggerWorkingDays === n
                          ? "default"
                          : "outline"
                      }
                      onClick={() => {
                        setStaggerMode("preset")
                        setStaggerWorkingDays(n)
                        setPreview(null)
                      }}
                    >
                      {n} {n === 1 ? "day" : "days"}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={staggerMode === "custom" ? "default" : "outline"}
                    onClick={() => {
                      setStaggerMode("custom")
                      setPreview(null)
                    }}
                  >
                    Custom
                  </Button>
                </div>
                {staggerMode === "custom" && (
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={customStagger}
                    onChange={(e) => {
                      setCustomStagger(e.target.value)
                      setPreview(null)
                    }}
                    placeholder="Working days"
                    className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">4. Work item category</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={categoryScope === "all"}
                    onChange={() => {
                      setCategoryScope("all")
                      setPreview(null)
                    }}
                  />
                  All categories
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={categoryScope === "one"}
                    onChange={() => {
                      setCategoryScope("one")
                      setPreview(null)
                    }}
                  />
                  One category
                </label>
              </div>
              {categoryScope === "one" && (
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value)
                    setPreview(null)
                  }}
                  className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">5. Task scope</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "critical"}
                    onChange={() => {
                      setMode("critical")
                      setPreview(null)
                    }}
                  />
                  Critical tasks only
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "all"}
                    onChange={() => {
                      setMode("all")
                      setPreview(null)
                    }}
                  />
                  All remaining tasks
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={respectExisting}
                  onChange={(e) => {
                    setRespectExisting(e.target.checked)
                    setPreview(null)
                  }}
                />
                Respect existing scheduled dates
              </label>
            </section>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canGenerate || loading || orderedSelected.length === 0}
                onClick={() => void handleGeneratePreview()}
              >
                {loading ? "Generating schedules…" : "Generate Preview"}
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {resultMessage && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {resultMessage}
              </p>
            )}

            {preview && (
              <section className="space-y-4 border-t border-border pt-4">
                <div>
                  <h3 className="text-base font-semibold">Batch Schedule Preview</h3>
                  <p className="text-sm text-muted-foreground">
                    {preview.houseCount} houses · {preview.staggerWorkingDays} working-day
                    stagger · {preview.categoryLabel} · {preview.modeLabel}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="text-emerald-700">✓ {preview.readyCount} ready</span>
                    {preview.reviewCount > 0 ? (
                      <span className="ml-3 text-amber-700">
                        ⚠ {preview.reviewCount} require review
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2">House</th>
                        <th className="p-2">Start</th>
                        <th className="p-2">Proposed finish</th>
                        <th className="p-2">Tasks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.homes.map((h) => (
                        <tr key={h.homeId} className="border-t border-border">
                          <td className="p-2 font-medium">{h.addressOrLot}</td>
                          <td className="p-2">{formatShortDate(h.anchorDate)}</td>
                          <td className="p-2">
                            {formatShortDate(h.preview.proposedCompletionDate)}
                          </td>
                          <td className="p-2">
                            {h.preview.proposedCount}
                            {h.preview.blockedCount > 0
                              ? ` · ${h.preview.blockedCount} blocked`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="space-y-2">
                  {preview.homes.map((h) => {
                    const open = expandedHomeId === h.homeId
                    return (
                      <li
                        key={h.homeId}
                        className={cn(
                          "rounded-lg border px-3 py-2",
                          h.needsReview ? "border-amber-300 bg-amber-50/40" : "border-border"
                        )}
                      >
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-2 text-left"
                          onClick={() =>
                            setExpandedHomeId(open ? null : h.homeId)
                          }
                        >
                          <div>
                            <p className="text-sm font-semibold">{h.addressOrLot}</p>
                            <p className="text-xs text-muted-foreground">
                              Anchor: {formatDisplayDate(h.anchorDate)} ·{" "}
                              {h.preview.proposedCount} tasks proposed
                              {h.preview.proposedCompletionDate
                                ? ` · finish ${formatShortDate(h.preview.proposedCompletionDate)}`
                                : ""}
                              {h.preview.blockedCount > 0
                                ? ` · ${h.preview.blockedCount} blocked`
                                : ""}
                            </p>
                            {h.preview.error ? (
                              <p className="text-xs text-destructive">{h.preview.error}</p>
                            ) : null}
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 transition-transform",
                              open && "rotate-180"
                            )}
                          />
                        </button>
                        {open && (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="p-1 text-left">Work item</th>
                                  <th className="p-1 text-left">Existing</th>
                                  <th className="p-1 text-left">Proposed</th>
                                  <th className="p-1 text-left">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {h.preview.rows.map((row) => (
                                  <tr key={row.taskId} className="border-t border-border/60">
                                    <td className="p-1">
                                      {row.taskName}
                                      {row.isCritical ? " · Critical" : ""}
                                    </td>
                                    <td className="p-1">
                                      {formatShortDate(row.currentScheduledDate)}
                                    </td>
                                    <td className="p-1">
                                      {row.blocked
                                        ? "—"
                                        : formatShortDate(row.proposedStart)}
                                    </td>
                                    <td className="p-1 text-muted-foreground">
                                      {row.blocked
                                        ? row.blockedReason ?? "Blocked"
                                        : row.preservedExisting
                                          ? "Existing date preserved"
                                          : "Proposed"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>

                <div className="flex flex-wrap gap-2 pb-2">
                  <Button
                    type="button"
                    disabled={preview.totalApplyTasks === 0 || applying}
                    onClick={() => setApplyOpen(true)}
                  >
                    Apply Schedules
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportPdf}
                  >
                    Print / Export PDF
                  </Button>
                </div>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply generated schedules?</DialogTitle>
            <DialogDescription>
              Apply generated schedules to {preview?.readyCount ?? 0} house
              {(preview?.readyCount ?? 0) === 1 ? "" : "s"}?
              <br />
              Category: {preview?.categoryLabel}
              <br />
              Stagger: {preview?.staggerWorkingDays} working days
              <br />
              Tasks affected: {preview?.totalApplyTasks}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={applying} onClick={() => void handleApply()}>
              {applying ? "Applying…" : "Apply Schedules"}
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

function buildBatchExportHtml(preview: BatchPreview, subdivisionName: string): string {
  const generatedAt = format(new Date(), "MMM d, yyyy")
  const sections = preview.homes
    .map((h) => {
      const rows = h.preview.rows
        .filter((r) => !r.blocked && r.proposedStart)
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.taskName)}</td><td>${formatDisplayDate(r.proposedStart)}</td><td>${r.durationDays}</td></tr>`
        )
        .join("")
      return `<h2>${escapeHtml(h.addressOrLot)}</h2>
      <p>Start: ${formatDisplayDate(h.anchorDate)}</p>
      <table><thead><tr><th>Work Item</th><th>Scheduled Date</th><th>Duration</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='3'>No proposed tasks</td></tr>"}</tbody></table>`
    })
    .join("")

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Batch Schedule</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:24px;font-size:12px;color:#111}
    h1{font-size:20px;margin:0 0 8px} h2{font-size:14px;margin:20px 0 6px;page-break-before:auto}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
    th{background:#f3f3f3}
    .meta{color:#444;line-height:1.5;margin-bottom:16px}
    @media print{tr{page-break-inside:avoid}}
  </style></head><body>
  <h1>Batch Schedule Preview</h1>
  <div class="meta">
    <div><strong>${escapeHtml(subdivisionName)}</strong></div>
    <div>Generated: ${generatedAt}</div>
    <div>Category: ${escapeHtml(preview.categoryLabel)}</div>
    <div>Mode: ${escapeHtml(preview.modeLabel)}</div>
    <div>Stagger: ${preview.staggerWorkingDays} working days</div>
    <div>${preview.scheduleBehaviorLabel}</div>
  </div>
  ${sections}
  <script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)});</script>
  </body></html>`
}
