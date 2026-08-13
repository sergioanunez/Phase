"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ContractorPickerSheet,
  type ContractorFilterOption,
} from "@/components/calendar/contractor-filter"
import {
  buildCalendarExportHtml,
  summarizeExportDocument,
  type CalendarExportActivity,
} from "@/lib/calendar/export-document"
import {
  formatExportRangeLabel,
  productionScheduleTitle,
  resolveCalendarExportRange,
  toExportQueryDate,
  type CalendarExportRangePreset,
} from "@/lib/calendar/export-range"
import { appendCalendarQueryFilters } from "@/lib/calendar/filters"

type ExportStep = 1 | 2 | 3

type ActivityScope = "all" | "contractor"

export function CalendarExportDialog({
  open,
  onOpenChange,
  preselectedContractor,
  subdivisionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefill from Calendar contractor filter; user may change or clear. */
  preselectedContractor: ContractorFilterOption | null
  subdivisionId?: string | null
}) {
  const [step, setStep] = useState<ExportStep>(1)
  const [preset, setPreset] = useState<CalendarExportRangePreset>("30")
  const [customStart, setCustomStart] = useState(format(new Date(), "yyyy-MM-dd"))
  const [customEnd, setCustomEnd] = useState(
    format(new Date(Date.now() + 29 * 86400000), "yyyy-MM-dd")
  )
  const [activityScope, setActivityScope] = useState<ActivityScope>("all")
  const [selectedContractor, setSelectedContractor] =
    useState<ContractorFilterOption | null>(null)
  const [contractorOptions, setContractorOptions] = useState<ContractorFilterOption[]>([])
  const [contractorsLoading, setContractorsLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewActivities, setPreviewActivities] = useState<CalendarExportActivity[]>([])
  const [branding, setBranding] = useState<{
    companyName: string
    logoUrl: string | null
    showPhaseFooter: boolean
  }>({ companyName: "Phase", logoUrl: null, showPhaseFooter: true })

  const resolvedRange = useMemo(
    () =>
      resolveCalendarExportRange({
        preset,
        customStart,
        customEnd,
      }),
    [preset, customStart, customEnd]
  )

  useEffect(() => {
    if (!open) return
    setStep(1)
    setPreset("30")
    setCustomStart(format(new Date(), "yyyy-MM-dd"))
    setCustomEnd(format(new Date(Date.now() + 29 * 86400000), "yyyy-MM-dd"))
    setError(null)
    setPreviewActivities([])
    if (preselectedContractor) {
      setActivityScope("contractor")
      setSelectedContractor(preselectedContractor)
    } else {
      setActivityScope("all")
      setSelectedContractor(null)
    }
  }, [open, preselectedContractor])

  useEffect(() => {
    if (!open) return
    fetch("/api/company/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        const whiteLabel = data.pricingTier === "WHITE_LABEL"
        setBranding({
          companyName: data.brandAppName || data.name || "Phase",
          logoUrl: data.logoUrl || null,
          showPhaseFooter: !whiteLabel,
        })
      })
      .catch(() => undefined)
  }, [open])

  useEffect(() => {
    if (!open || activityScope !== "contractor") return
    if ("error" in resolvedRange) return
    let cancelled = false
    setContractorsLoading(true)
    const params = new URLSearchParams({
      start: toExportQueryDate(resolvedRange.start),
      end: toExportQueryDate(resolvedRange.end),
    })
    appendCalendarQueryFilters(params, {
      ...(subdivisionId ? { subdivisionId } : {}),
    })
    fetch(`/api/calendar/contractors?${params}`)
      .then((r) => (r.ok ? r.json() : { contractors: [] }))
      .then((data: { contractors?: ContractorFilterOption[] }) => {
        if (cancelled) return
        setContractorOptions(Array.isArray(data.contractors) ? data.contractors : [])
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
  }, [open, activityScope, resolvedRange, subdivisionId])

  const canContinueStep1 = !("error" in resolvedRange)
  const canContinueStep2 =
    activityScope === "all" || Boolean(selectedContractor?.id)

  const loadPreview = async () => {
    if ("error" in resolvedRange) {
      setError(resolvedRange.error)
      return
    }
    if (activityScope === "contractor" && !selectedContractor) {
      setError("Select a contractor.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        start: toExportQueryDate(resolvedRange.start),
        end: toExportQueryDate(resolvedRange.end),
      })
      appendCalendarQueryFilters(params, {
        ...(subdivisionId ? { subdivisionId } : {}),
        ...(activityScope === "contractor" && selectedContractor
          ? { contractorId: selectedContractor.id }
          : {}),
      })
      const res = await fetch(`/api/calendar/events?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load schedule")
        setPreviewActivities([])
        return
      }
      const events = Array.isArray(data) ? (data as CalendarExportActivity[]) : []
      // Export is read-only reporting of scheduled work (trade/milestone/inspection).
      // Exclude punchlist from production look-ahead unless we later add a toggle.
      const workEvents = events.filter((e) => e.type !== "punchlist")
      setPreviewActivities(workEvents)
      setStep(3)
    } catch {
      setError("Failed to load schedule")
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    if ("error" in resolvedRange) return
    const html = buildCalendarExportHtml({
      activities: previewActivities,
      rangeStart: resolvedRange.start,
      rangeEnd: resolvedRange.end,
      preset: resolvedRange.preset,
      labelDays: resolvedRange.labelDays,
      scope: activityScope,
      contractorName:
        activityScope === "contractor" ? selectedContractor?.name ?? null : null,
      companyName: branding.companyName,
      companyLogoUrl: branding.logoUrl,
      showPhaseFooter: branding.showPhaseFooter,
    })
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, "_blank")
    if (!w) {
      setError("Pop-up blocked — allow pop-ups to print/export.")
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const summary = summarizeExportDocument({ activities: previewActivities })
  const rangeLabel =
    "error" in resolvedRange
      ? ""
      : formatExportRangeLabel(resolvedRange.start, resolvedRange.end)
  const titleCore =
    "error" in resolvedRange
      ? "Production Schedule"
      : productionScheduleTitle(resolvedRange.preset, resolvedRange.labelDays)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-4 py-3 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              {step === 3 ? "Preview" : `Step ${step} of 2`}
            </p>
            <DialogTitle className="text-lg">
              {step === 3 ? "Export Preview" : "Print / Export Calendar"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {step === 3
                ? "Read-only report of scheduled work. Nothing is changed."
                : "Configure a look-ahead report for printing or PDF."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {error && (
              <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Schedule range</h3>
                {(
                  [
                    ["30", "Next 30 days"],
                    ["60", "Next 60 days"],
                    ["90", "Next 90 days"],
                    ["custom", "Custom"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={preset === value}
                      onChange={() => setPreset(value)}
                    />
                    {label}
                  </label>
                ))}
                {preset === "custom" && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Start date
                      </label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full rounded-lg border border-border px-2 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        End date
                      </label>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full rounded-lg border border-border px-2 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
                {"error" in resolvedRange ? (
                  <p className="text-xs text-destructive">{resolvedRange.error}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{rangeLabel}</p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Show</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={activityScope === "all"}
                    onChange={() => {
                      setActivityScope("all")
                      setSelectedContractor(null)
                    }}
                  />
                  All scheduled activities
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={activityScope === "contractor"}
                    onChange={() => setActivityScope("contractor")}
                  />
                  One contractor
                </label>
                {activityScope === "contractor" && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="mt-1 flex w-full items-center justify-between rounded-lg border border-border bg-white px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                  >
                    <span
                      className={
                        selectedContractor ? undefined : "text-muted-foreground"
                      }
                    >
                      {selectedContractor?.name ?? "Select contractor…"}
                    </span>
                    <span className="text-xs text-muted-foreground">▼</span>
                  </button>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3 text-sm">
                {activityScope === "contractor" && selectedContractor && (
                  <p className="text-base font-semibold">{selectedContractor.name}</p>
                )}
                <p className="font-semibold">{titleCore}</p>
                <p className="text-muted-foreground">{rangeLabel}</p>
                {summary.activityCount === 0 ? (
                  <p className="rounded-lg border border-border bg-muted/30 px-3 py-6 text-center text-muted-foreground">
                    {activityScope === "contractor" && selectedContractor
                      ? `No scheduled work for ${selectedContractor.name}`
                      : "No scheduled activities"}
                    <br />
                    <span className="text-xs">{rangeLabel}</span>
                  </p>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      {summary.houseCount} house
                      {summary.houseCount === 1 ? "" : "s"} · {summary.activityCount}{" "}
                      scheduled activit
                      {summary.activityCount === 1 ? "y" : "ies"}
                    </p>
                    <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-xs">
                      {previewActivities.slice(0, 40).map((a) => (
                        <li key={a.id} className="border-b border-border/50 pb-2 last:border-0">
                          <span className="font-medium">
                            {format(new Date(`${a.date}T12:00:00`), "MMM d")}
                          </span>
                          {" · "}
                          {a.homeLabel ?? "—"}
                          <br />
                          {a.title}
                          {activityScope === "all" && a.contractorName
                            ? ` · ${a.contractorName}`
                            : ""}
                        </li>
                      ))}
                      {previewActivities.length > 40 && (
                        <li className="text-muted-foreground">
                          +{previewActivities.length - 40} more in print view…
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (step === 1) onOpenChange(false)
                else if (step === 3) setStep(2)
                else setStep(1)
              }}
            >
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            <div className="flex gap-2">
              {step === 1 && (
                <Button
                  type="button"
                  disabled={!canContinueStep1}
                  onClick={() => setStep(2)}
                >
                  Continue
                </Button>
              )}
              {step === 2 && (
                <Button
                  type="button"
                  disabled={!canContinueStep2 || loading}
                  onClick={() => void loadPreview()}
                >
                  {loading ? "Loading…" : "Preview"}
                </Button>
              )}
              {step === 3 && (
                <Button
                  type="button"
                  disabled={summary.activityCount === 0}
                  onClick={handlePrint}
                >
                  Print / Save PDF
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContractorPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        contractors={contractorOptions}
        loading={contractorsLoading}
        selectedId={selectedContractor?.id ?? null}
        showAllOption={false}
        title="Select contractor"
        onSelect={(c) => setSelectedContractor(c)}
      />
    </>
  )
}
