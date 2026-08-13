"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react"
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
import {
  ContractorPickerSheet,
  type ContractorFilterOption,
} from "@/components/calendar/contractor-filter"
import {
  canContinueBatchWizardStep1,
  canContinueBatchWizardStep2,
  canContinueBatchWizardStep3,
  computeStaggeredAnchorDate,
  effectiveStaggerWorkingDays,
  isStaggerIntervalValid,
  wizardStepHelper,
  wizardStepTitle,
  type BatchWizardStep,
} from "@/lib/homes/batch-generate-wizard"

type GenerateScheduleMode = "critical" | "all"
type WorkScope = "all" | "category" | "contractor"

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
  contractorId: string | null
  contractorLabel: string | null
  workScopeLabel: string
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

function parseLocalDateInput(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00`)
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
  homes: BatchHomeOption[]
  canGenerate: boolean
  onApplied?: () => void
}) {
  const [step, setStep] = useState<BatchWizardStep>(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [orderedSelectedIds, setOrderedSelectedIds] = useState<string[]>([])
  const [baseAnchorDate, setBaseAnchorDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [staggerEnabled, setStaggerEnabled] = useState(false)
  const [staggerPreset, setStaggerPreset] = useState(2)
  const [customStagger, setCustomStagger] = useState("2")
  const [staggerMode, setStaggerMode] = useState<"preset" | "custom">("preset")
  const [mode, setMode] = useState<GenerateScheduleMode>("critical")
  const [respectExisting, setRespectExisting] = useState(true)
  const [workScope, setWorkScope] = useState<WorkScope>("all")
  const [category, setCategory] = useState("")
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [selectedContractor, setSelectedContractor] =
    useState<ContractorFilterOption | null>(null)
  const [contractorOptions, setContractorOptions] = useState<ContractorFilterOption[]>([])
  const [contractorsLoading, setContractorsLoading] = useState(false)
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false)
  const [preview, setPreview] = useState<BatchPreview | null>(null)
  const [expandedHomeId, setExpandedHomeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const resetWizard = useCallback(() => {
    const ids = homes.map((h) => h.id)
    setStep(1)
    setSelectedIds(ids)
    setOrderedSelectedIds(ids)
    setBaseAnchorDate(format(new Date(), "yyyy-MM-dd"))
    setStaggerEnabled(false)
    setStaggerPreset(2)
    setCustomStagger("2")
    setStaggerMode("preset")
    setMode("critical")
    setRespectExisting(true)
    setWorkScope("all")
    setCategory("")
    setSelectedContractor(null)
    setContractorOptions([])
    setPreview(null)
    setExpandedHomeId(null)
    setError(null)
    setResultMessage(null)
    setDirty(false)
  }, [homes])

  useEffect(() => {
    if (!open) return
    resetWizard()
    fetch("/api/settings/work-template-categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CategoryOption[]) =>
        setCategories(
          Array.isArray(rows) ? rows.filter((c) => (c.itemCount ?? 0) > 0) : []
        )
      )
      .catch(() => setCategories([]))
  }, [open, resetWizard])

  useEffect(() => {
    if (!open || workScope !== "contractor" || orderedSelectedIds.length === 0) return
    const homeIds = orderedSelectedIds.filter((id) => selectedIds.includes(id))
    if (homeIds.length === 0) return
    let cancelled = false
    setContractorsLoading(true)
    fetch(`/api/subdivisions/${subdivisionId}/generate-schedules/contractors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeIds }),
    })
      .then((r) => (r.ok ? r.json() : { contractors: [] }))
      .then((data: { contractors?: ContractorFilterOption[] }) => {
        if (cancelled) return
        const list = Array.isArray(data.contractors) ? data.contractors : []
        setContractorOptions(list)
        if (selectedContractor && !list.some((c) => c.id === selectedContractor.id)) {
          setSelectedContractor(null)
        }
      })
      .catch(() => {
        if (!cancelled) setContractorOptions([])
      })
      .finally(() => {
        if (!cancelled) setContractorsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Intentionally omit selectedContractor to avoid refetch loops when clearing invalid selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workScope, subdivisionId, selectedIds, orderedSelectedIds])

  const homeById = useMemo(() => new Map(homes.map((h) => [h.id, h])), [homes])

  const orderedSelected = useMemo(
    () => orderedSelectedIds.filter((id) => selectedIds.includes(id)),
    [orderedSelectedIds, selectedIds]
  )

  const staggerParams = {
    staggerEnabled,
    staggerMode,
    staggerPreset,
    customStagger,
  }
  const staggerDays = effectiveStaggerWorkingDays(staggerParams)

  const liveStaggerPreview = useMemo(() => {
    if (!canContinueBatchWizardStep3(baseAnchorDate)) return []
    const base = parseLocalDateInput(baseAnchorDate)
    return orderedSelected.map((id, orderIndex) => {
      const h = homeById.get(id)
      const anchor = computeStaggeredAnchorDate(base, orderIndex, staggerDays)
      return {
        homeId: id,
        addressOrLot: h?.addressOrLot ?? id,
        orderIndex,
        anchorDate: anchor.toISOString(),
      }
    })
  }, [baseAnchorDate, orderedSelected, homeById, staggerDays])

  const markDirty = () => setDirty(true)

  const requestClose = () => {
    if (dirty || preview) {
      if (!confirm("Discard schedule setup?")) return
    }
    onOpenChange(false)
  }

  const toggleHome = (id: string) => {
    markDirty()
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
    setOrderedSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setPreview(null)
  }

  const selectAll = () => {
    markDirty()
    const ids = homes.map((h) => h.id)
    setSelectedIds(ids)
    setOrderedSelectedIds(ids)
    setPreview(null)
  }

  const clearAll = () => {
    markDirty()
    setSelectedIds([])
    setPreview(null)
  }

  const moveSelected = (id: string, dir: -1 | 1) => {
    markDirty()
    setOrderedSelectedIds((prev) => {
      const list = prev.filter((x) => selectedIds.includes(x))
      const idx = list.indexOf(id)
      if (idx < 0) return prev
      const j = idx + dir
      if (j < 0 || j >= list.length) return prev
      const next = [...list]
      ;[next[idx], next[j]] = [next[j]!, next[idx]!]
      const rest = prev.filter((x) => !selectedIds.includes(x))
      return [...next, ...rest]
    })
    setPreview(null)
  }

  const canContinue =
    step === 1
      ? canContinueBatchWizardStep1(selectedIds.length)
      : step === 2
        ? canContinueBatchWizardStep2({
            workScope,
            category,
            contractorId: selectedContractor?.id ?? null,
          })
        : canContinueBatchWizardStep3(baseAnchorDate) &&
          isStaggerIntervalValid(staggerParams)

  const scopePayload = () => ({
    category: workScope === "category" ? category : null,
    contractorId: workScope === "contractor" ? selectedContractor?.id ?? null : null,
  })

  const goNext = () => {
    if (!canContinue) return
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
  }

  const goBack = () => {
    setError(null)
    if (preview) {
      setPreview(null)
      return
    }
    if (step === 3) setStep(2)
    else if (step === 2) setStep(1)
  }

  const handleGeneratePreview = async () => {
    if (!canGenerate || !canContinue || orderedSelected.length === 0) return
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
            staggerWorkingDays: staggerDays,
            mode,
            respectExistingScheduledDates: respectExisting,
            ...scopePayload(),
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
            staggerWorkingDays: staggerDays,
            mode,
            respectExistingScheduledDates: respectExisting,
            ...scopePayload(),
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
        `Schedules applied · ${data.appliedHomes} house${data.appliedHomes === 1 ? "" : "s"} · ${data.tasksUpdated} tasks` +
          (staggerEnabled
            ? ` · ${data.staggerWorkingDays}-day stagger`
            : " · same start date")
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
      setDirty(false)
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

  const workLabel =
    workScope === "contractor" && selectedContractor
      ? selectedContractor.name
      : workScope === "category" && category
        ? category
        : "All work"
  const scopeLabel =
    mode === "critical" ? "Critical tasks only" : "All remaining tasks"

  const showingPreview = preview != null

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose()
          else onOpenChange(true)
        }}
      >
        <DialogContent className="flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(92vh,900px)] sm:max-w-[min(40rem,calc(100vw-1.5rem))] sm:rounded-xl sm:border">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
            <div className="min-w-0 pr-8">
              <p className="text-xs font-medium text-muted-foreground">
                {showingPreview
                  ? "Preview"
                  : `Step ${step} of 3 · ${subdivisionName}`}
              </p>
              <DialogTitle className="text-lg">
                {showingPreview
                  ? "Batch Schedule Preview"
                  : wizardStepTitle(step)}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {showingPreview
                  ? `${preview.houseCount} houses · ${preview.workScopeLabel ?? preview.categoryLabel} · ${preview.modeLabel} · ${
                      preview.staggerWorkingDays > 0
                        ? `${preview.staggerWorkingDays} working-day stagger`
                        : "Same start date"
                    }`
                  : wizardStepHelper(step)}
              </DialogDescription>
            </div>

            {!showingPreview && (
              <ol className="mt-3 flex gap-1.5">
                {(
                  [
                    [1, "Houses"],
                    [2, "Work"],
                    [3, "Start Dates"],
                  ] as const
                ).map(([n, label]) => (
                  <li
                    key={n}
                    className={cn(
                      "flex-1 rounded-full px-2 py-1 text-center text-[11px] font-medium",
                      step === n
                        ? "bg-primary text-primary-foreground"
                        : step > n
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {n}. {label}
                  </li>
                ))}
              </ol>
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            {!showingPreview && step === 1 && (
              <section className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
                    Clear All
                  </Button>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {homes.map((h) => (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(h.id)}
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
                  ))}
                </ul>
              </section>
            )}

            {!showingPreview && step === 2 && (
              <section className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Generate schedule for</h3>
                  <div className="flex flex-col gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={workScope === "all"}
                        onChange={() => {
                          markDirty()
                          setWorkScope("all")
                          setCategory("")
                          setSelectedContractor(null)
                        }}
                      />
                      All work
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={workScope === "category"}
                        onChange={() => {
                          markDirty()
                          setWorkScope("category")
                          setSelectedContractor(null)
                        }}
                      />
                      One category
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={workScope === "contractor"}
                        onChange={() => {
                          markDirty()
                          setWorkScope("contractor")
                          setCategory("")
                        }}
                      />
                      One contractor / trade
                    </label>
                  </div>
                  {workScope === "category" && (
                    <select
                      value={category}
                      onChange={(e) => {
                        markDirty()
                        setCategory(e.target.value)
                      }}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <option value="">Select category…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {workScope === "contractor" && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Contractor
                      </p>
                      <button
                        type="button"
                        onClick={() => setContractorPickerOpen(true)}
                        className="flex w-full items-center justify-between rounded-lg border border-border bg-white px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                      >
                        <span
                          className={cn(
                            !selectedContractor && "text-muted-foreground"
                          )}
                        >
                          {selectedContractor
                            ? selectedContractor.name
                            : "Select contractor…"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {selectedContractor
                            ? `${selectedContractor.taskCount} tasks`
                            : "▼"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Task scope</h3>
                  <div className="flex flex-col gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={mode === "critical"}
                        onChange={() => {
                          markDirty()
                          setMode("critical")
                        }}
                      />
                      Critical tasks only
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={mode === "all"}
                        onChange={() => {
                          markDirty()
                          setMode("all")
                        }}
                      />
                      All remaining tasks
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Existing dates</h3>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={respectExisting}
                      onChange={(e) => {
                        markDirty()
                        setRespectExisting(e.target.checked)
                      }}
                    />
                    <span>
                      <span className="font-medium">Respect existing scheduled dates</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Keep dates that are already scheduled and generate only the remaining
                        eligible work. When off, only regenerate dates within the selected
                        work scope. Completed and N/A tasks are never changed.
                      </span>
                    </span>
                  </label>
                </div>
              </section>
            )}

            {!showingPreview && step === 3 && (
              <section className="space-y-5">
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    First house starts
                  </label>
                  <input
                    type="date"
                    value={baseAnchorDate}
                    onChange={(e) => {
                      markDirty()
                      setBaseAnchorDate(e.target.value)
                      setPreview(null)
                    }}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={staggerEnabled}
                      onChange={(e) => {
                        markDirty()
                        setStaggerEnabled(e.target.checked)
                        setPreview(null)
                      }}
                    />
                    <span>
                      <span className="font-medium">Stagger house starts</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Start each house a few working days after the previous one.
                      </span>
                    </span>
                  </label>

                  {staggerEnabled && (
                    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
                      {orderedSelected.length > 1 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Order for stagger</p>
                          <p className="text-xs text-muted-foreground">
                            First house starts on the date above. Session order only —
                            does not change the subdivision’s saved sequence.
                          </p>
                          <ol className="space-y-1.5">
                            {orderedSelected.map((id, index) => {
                              const h = homeById.get(id)
                              if (!h) return null
                              return (
                                <li
                                  key={id}
                                  className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5"
                                >
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  <span className="w-6 text-xs text-muted-foreground">
                                    {index + 1}.
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm">
                                    {h.addressOrLot}
                                  </span>
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
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-sm font-medium">Days between house starts</p>
                        <div className="flex flex-wrap gap-2">
                          {[1, 2, 3].map((n) => (
                            <Button
                              key={n}
                              type="button"
                              size="sm"
                              variant={
                                staggerMode === "preset" && staggerPreset === n
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => {
                                markDirty()
                                setStaggerMode("preset")
                                setStaggerPreset(n)
                                setPreview(null)
                              }}
                            >
                              {n} {n === 1 ? "working day" : "working days"}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant={staggerMode === "custom" ? "default" : "outline"}
                            onClick={() => {
                              markDirty()
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
                            min={1}
                            max={365}
                            value={customStagger}
                            onChange={(e) => {
                              markDirty()
                              setCustomStagger(e.target.value)
                              setPreview(null)
                            }}
                            placeholder="Working days"
                            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          />
                        )}
                      </div>

                      {liveStaggerPreview.length > 0 &&
                        isStaggerIntervalValid(staggerParams) && (
                          <ul className="space-y-1 border-t border-border pt-2 text-sm">
                            {liveStaggerPreview.map((row) => (
                              <li
                                key={row.homeId}
                                className="flex justify-between gap-3"
                              >
                                <span className="truncate">{row.addressOrLot}</span>
                                <span className="shrink-0 text-muted-foreground">
                                  {formatShortDate(row.anchorDate)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
                  <p className="font-semibold">
                    {orderedSelected.length} house
                    {orderedSelected.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {workLabel}
                    <br />
                    {scopeLabel}
                    <br />
                    {respectExisting
                      ? "Respect existing dates"
                      : "Recalculate eligible dates"}
                  </p>
                  <p className="mt-2">
                    {staggerEnabled && isStaggerIntervalValid(staggerParams)
                      ? `Starts ${formatShortDate(baseAnchorDate + "T12:00:00")} · ${staggerDays}-day stagger`
                      : `All start ${formatShortDate(baseAnchorDate + "T12:00:00")}`}
                  </p>
                </div>
              </section>
            )}

            {showingPreview && (
              <section className="space-y-4">
                {preview.contractorLabel ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <p className="font-semibold">{preview.contractorLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {preview.houseCount} houses · {preview.totalProposedTasks} work items ·{" "}
                      {preview.modeLabel}
                      {preview.staggerWorkingDays > 0
                        ? ` · ${preview.staggerWorkingDays}-day house stagger`
                        : ""}
                    </p>
                  </div>
                ) : null}
                <p className="text-sm">
                  <span className="text-emerald-700">✓ {preview.readyCount} ready</span>
                  {preview.reviewCount > 0 ? (
                    <span className="ml-3 text-amber-700">
                      ⚠ {preview.reviewCount} require review
                    </span>
                  ) : null}
                </p>

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
                    const openRow = expandedHomeId === h.homeId
                    return (
                      <li
                        key={h.homeId}
                        className={cn(
                          "rounded-lg border px-3 py-2",
                          h.needsReview
                            ? "border-amber-300 bg-amber-50/40"
                            : "border-border"
                        )}
                      >
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-2 text-left"
                          onClick={() =>
                            setExpandedHomeId(openRow ? null : h.homeId)
                          }
                        >
                          <div>
                            <p className="text-sm font-semibold">{h.addressOrLot}</p>
                            <p className="text-xs text-muted-foreground">
                              Anchor: {formatDisplayDate(h.anchorDate)} ·{" "}
                              {h.preview.proposedCount} tasks proposed
                              {h.preview.error ? ` · ${h.preview.error}` : ""}
                            </p>
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 transition-transform",
                              openRow && "rotate-180"
                            )}
                          />
                        </button>
                        {openRow && (
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
                                  <tr
                                    key={row.taskId}
                                    className="border-t border-border/60"
                                  >
                                    <td className="p-1">{row.taskName}</td>
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
              </section>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {resultMessage && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {resultMessage}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={
                  showingPreview || step > 1 ? goBack : requestClose
                }
              >
                {showingPreview || step > 1 ? "Back" : "Cancel"}
              </Button>

              <div className="flex flex-wrap gap-2">
                {showingPreview ? (
                  <>
                    <Button type="button" variant="outline" onClick={handleExportPdf}>
                      Print / Export PDF
                    </Button>
                    <Button
                      type="button"
                      disabled={preview.totalApplyTasks === 0 || applying}
                      onClick={() => setApplyOpen(true)}
                    >
                      Apply Schedules
                    </Button>
                  </>
                ) : step < 3 ? (
                  <Button type="button" disabled={!canContinue} onClick={goNext}>
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={
                      !canGenerate ||
                      !canContinue ||
                      loading ||
                      orderedSelected.length === 0
                    }
                    onClick={() => void handleGeneratePreview()}
                  >
                    {loading ? "Generating schedules…" : "Generate Preview"}
                  </Button>
                )}
              </div>
            </div>
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
              Scope: {preview?.workScopeLabel ?? preview?.categoryLabel}
              <br />
              {preview && preview.staggerWorkingDays > 0
                ? `Stagger: ${preview.staggerWorkingDays} working days`
                : "Same start date"}
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

      <ContractorPickerSheet
        open={contractorPickerOpen}
        onOpenChange={setContractorPickerOpen}
        contractors={contractorOptions}
        loading={contractorsLoading}
        selectedId={selectedContractor?.id ?? null}
        showAllOption={false}
        title="Select contractor"
        countSuffix="tasks"
        onSelect={(c) => {
          markDirty()
          setSelectedContractor(c)
        }}
      />
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
    h1{font-size:20px;margin:0 0 8px} h2{font-size:14px;margin:20px 0 6px}
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
    <div>Scope: ${escapeHtml(preview.workScopeLabel ?? preview.categoryLabel)}</div>
    <div>Mode: ${escapeHtml(preview.modeLabel)}</div>
    <div>${
      preview.staggerWorkingDays > 0
        ? `Stagger: ${preview.staggerWorkingDays} working days`
        : "Same start date"
    }</div>
    <div>${escapeHtml(preview.scheduleBehaviorLabel)}</div>
  </div>
  ${sections}
  <script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)});</script>
  </body></html>`
}
