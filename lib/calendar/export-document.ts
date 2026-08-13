/**
 * Read-only Calendar export document builder (HTML print / PDF).
 * Does not generate or mutate schedules.
 */

import { format, parseISO } from "date-fns"
import {
  formatExportRangeLabel,
  productionScheduleTitle,
  type CalendarExportRangePreset,
} from "@/lib/calendar/export-range"

export type CalendarExportActivity = {
  id: string
  date: string // yyyy-MM-dd
  title: string
  homeLabel?: string
  communityName?: string
  contractorId?: string
  contractorName?: string
  durationDays?: number | null
  type?: string
}

export type CalendarExportDocumentInput = {
  activities: CalendarExportActivity[]
  rangeStart: Date
  rangeEnd: Date
  preset: CalendarExportRangePreset
  labelDays: number | null
  scope: "all" | "contractor"
  contractorName: string | null
  companyName: string
  companyLogoUrl?: string | null
  generatedAt?: Date
  /** When true, show Phase footer; white-label still keeps builder identity primary. */
  showPhaseFooter?: boolean
}

export type ExportDayGroup = {
  dateKey: string
  dayHeading: string
  houses: ExportHouseGroup[]
}

export type ExportHouseGroup = {
  homeLabel: string
  communityName: string | null
  activities: CalendarExportActivity[]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Filter to inclusive date range (calendar days, yyyy-MM-dd compare). */
export function filterActivitiesInRange(
  activities: CalendarExportActivity[],
  start: Date,
  end: Date
): CalendarExportActivity[] {
  const startKey = format(start, "yyyy-MM-dd")
  const endKey = format(end, "yyyy-MM-dd")
  return activities.filter((a) => a.date >= startKey && a.date <= endKey)
}

export function filterActivitiesByContractor(
  activities: CalendarExportActivity[],
  contractorId: string | null
): CalendarExportActivity[] {
  if (!contractorId) return activities
  return activities.filter((a) => a.contractorId === contractorId)
}

/**
 * Chronological day → house groups. Multiple activities at same house/day stay together.
 */
export function groupExportActivities(
  activities: CalendarExportActivity[]
): ExportDayGroup[] {
  const byDate = new Map<string, CalendarExportActivity[]>()
  for (const a of [...activities].sort((x, y) => {
    const d = x.date.localeCompare(y.date)
    if (d !== 0) return d
    const h = (x.homeLabel ?? "").localeCompare(y.homeLabel ?? "")
    if (h !== 0) return h
    return x.title.localeCompare(y.title)
  })) {
    const list = byDate.get(a.date) ?? []
    list.push(a)
    byDate.set(a.date, list)
  }

  const days: ExportDayGroup[] = []
  for (const [dateKey, dayActs] of byDate) {
    const houseOrder: string[] = []
    const houseMap = new Map<string, ExportHouseGroup>()
    for (const a of dayActs) {
      const key = a.homeLabel ?? a.id
      if (!houseMap.has(key)) {
        houseOrder.push(key)
        houseMap.set(key, {
          homeLabel: a.homeLabel ?? "Unknown house",
          communityName: a.communityName ?? null,
          activities: [],
        })
      }
      houseMap.get(key)!.activities.push(a)
    }
    days.push({
      dateKey,
      dayHeading: format(parseISO(dateKey), "EEEE · MMM d").toUpperCase(),
      houses: houseOrder.map((k) => houseMap.get(k)!),
    })
  }
  return days
}

export function summarizeExportDocument(input: {
  activities: CalendarExportActivity[]
}): { houseCount: number; activityCount: number } {
  const houses = new Set(
    input.activities.map((a) => a.homeLabel ?? a.id).filter(Boolean)
  )
  return { houseCount: houses.size, activityCount: input.activities.length }
}

function durationSuffix(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days <= 0) return ""
  return ` · ${Math.floor(days)}d`
}

export function buildCalendarExportHtml(input: CalendarExportDocumentInput): string {
  const generated = input.generatedAt ?? new Date()
  const rangeLabel = formatExportRangeLabel(input.rangeStart, input.rangeEnd)
  const titleCore = productionScheduleTitle(input.preset, input.labelDays)
  const isContractor = input.scope === "contractor" && input.contractorName
  const docTitle = isContractor
    ? `${input.contractorName} · ${titleCore}`
    : titleCore

  const filtered = filterActivitiesInRange(
    input.activities,
    input.rangeStart,
    input.rangeEnd
  )
  const { houseCount, activityCount } = summarizeExportDocument({
    activities: filtered,
  })
  const days = groupExportActivities(filtered)

  const empty =
    filtered.length === 0
      ? isContractor
        ? `<div class="empty">No scheduled work for ${escapeHtml(
            input.contractorName!
          )}<br/><span class="muted">${escapeHtml(rangeLabel)}</span></div>`
        : `<div class="empty">No scheduled activities<br/><span class="muted">${escapeHtml(
            rangeLabel
          )}</span></div>`
      : ""

  const bodyDays = days
    .map((day) => {
      const housesHtml = day.houses
        .map((house) => {
          const community = house.communityName
            ? `<div class="community">${escapeHtml(house.communityName)}</div>`
            : ""
          if (isContractor) {
            const items = house.activities
              .map(
                (a) =>
                  `<div class="item">${escapeHtml(a.title)}${escapeHtml(
                    durationSuffix(a.durationDays)
                  )}</div>`
              )
              .join("")
            return `<div class="house">
              <div class="address">${escapeHtml(house.homeLabel)}</div>
              ${community}
              ${items}
            </div>`
          }
          const items = house.activities
            .map((a) => {
              const contractor = a.contractorName
                ? ` — ${escapeHtml(a.contractorName)}`
                : ""
              return `<li>${escapeHtml(a.title)}${contractor}${escapeHtml(
                durationSuffix(a.durationDays)
              )}</li>`
            })
            .join("")
          return `<div class="house">
            <div class="address">${escapeHtml(house.homeLabel)}</div>
            ${community}
            <ul class="items">${items}</ul>
          </div>`
        })
        .join("")
      return `<section class="day">
        <h2 class="day-heading">${escapeHtml(day.dayHeading)}</h2>
        ${housesHtml}
      </section>`
    })
    .join("")

  const logo = input.companyLogoUrl
    ? `<img class="logo" src="${escapeHtml(input.companyLogoUrl)}" alt="${escapeHtml(
        input.companyName
      )}" />`
    : `<div class="company-name">${escapeHtml(input.companyName)}</div>`

  const headerContractor = isContractor
    ? `<div class="contractor">${escapeHtml(input.contractorName!)}</div>`
    : ""

  const summary =
    filtered.length > 0
      ? `<div class="summary">${houseCount} house${
          houseCount === 1 ? "" : "s"
        } · ${activityCount} scheduled activit${activityCount === 1 ? "y" : "ies"}</div>`
      : ""

  const showPhase = input.showPhaseFooter !== false

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(docTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #111;
      margin: 0;
      padding: 0.5in 0.55in 0.65in;
      font-size: 11pt;
      line-height: 1.35;
    }
    .logo { max-height: 42px; max-width: 180px; margin-bottom: 10px; }
    .company-name { font-size: 14pt; font-weight: 700; margin-bottom: 8px; }
    .contractor { font-size: 16pt; font-weight: 700; margin: 4px 0 2px; }
    h1 { font-size: 14pt; font-weight: 700; margin: 0 0 4px; }
    .meta { font-size: 10pt; color: #333; margin-bottom: 4px; }
    .summary { font-size: 10pt; color: #444; margin: 8px 0 16px; }
    .empty { margin-top: 32px; text-align: center; font-size: 12pt; }
    .muted { color: #555; font-size: 10pt; }
    .day { margin-top: 18px; page-break-inside: avoid; }
    .day-heading {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      border-bottom: 1px solid #222;
      padding-bottom: 3px;
      margin: 0 0 10px;
      page-break-after: avoid;
    }
    .house { margin: 0 0 12px 0; page-break-inside: avoid; }
    .address { font-weight: 700; font-size: 11pt; }
    .community { font-size: 9pt; color: #444; margin: 1px 0 4px; }
    .item { margin: 2px 0 2px 0; }
    ul.items { margin: 4px 0 0 1.1em; padding: 0; }
    ul.items li { margin: 2px 0; }
    .footer {
      position: running(footer);
      font-family: system-ui, sans-serif;
      font-size: 8pt;
      color: #666;
      text-align: center;
      border-top: 1px solid #ccc;
      padding-top: 4px;
    }
    @page {
      size: letter portrait;
      margin: 0.5in 0.55in 0.75in;
    }
    @media print {
      body { padding: 0; }
      .day { page-break-inside: avoid; }
      .house { page-break-inside: avoid; }
      .day-heading { page-break-after: avoid; }
      .print-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        border-top: 1px solid #ccc;
        padding: 4px 0;
        background: #fff;
      }
      .print-footer::after {
        content: " · Page " counter(page);
      }
    }
    .print-footer {
      margin-top: 28px;
      padding-top: 6px;
      border-top: 1px solid #ccc;
      font-family: system-ui, sans-serif;
      font-size: 8pt;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    ${logo}
    ${headerContractor}
    <h1>${escapeHtml(titleCore)}</h1>
    <div class="meta">${escapeHtml(rangeLabel)}</div>
    <div class="meta">Generated ${escapeHtml(format(generated, "MMM d, yyyy"))}</div>
    ${summary}
  </header>
  ${empty || bodyDays}
  <div class="print-footer">
    ${showPhase ? "Powered by Phase · " : ""}${escapeHtml(
      input.companyName
    )} · Generated ${escapeHtml(format(generated, "MMM d, yyyy"))}
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 300);
    });
  </script>
</body>
</html>`
}
