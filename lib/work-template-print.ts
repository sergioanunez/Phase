import { format } from "date-fns"
import { computeCategoryCriticalPathDuration } from "@/lib/scheduling/categoryDuration"

export type WorkTemplatePrintMode = "compact" | "detailed" | "working"

export type WorkTemplatePrintCategoryRow = {
  id: string
  name: string
  categoryPosition: number
}

export type WorkTemplatePrintItem = {
  id: string
  name: string
  defaultDurationDays: number
  sortOrder: number
  sequenceOrder?: number | null
  optionalCategory: string | null
  workTemplateCategoryId?: string | null
  itemPosition?: number | null
  isCriticalGate: boolean
  gateName: string | null
  prepLeadDays?: number
  requiresOrdering?: boolean
  materialLeadDays?: number
  contractorId?: string | null
  contractorLeadOverrideDays?: number | null
  contractor?: { id: string; companyName: string; trade: string | null; leadDays: number } | null
  workTemplateCategory?: { id: string; name: string; categoryPosition: number } | null
  dependencies?: Array<{
    dependsOnItemId: string
    dependsOnItem: { id: string; name: string } | null
  }>
}

export type WorkTemplatePrintBlock = {
  id: string
  categoryName: string
  categoryIndex: number
  items: WorkTemplatePrintItem[]
  itemCount: number
  workingDays: number | null
}

export type WorkTemplatePrintData = {
  companyName: string
  companyLogoUrl?: string | null
  generatedAt: string
  mode: WorkTemplatePrintMode
  totalCategories: number
  totalWorkItems: number
  totalWorkingDays: number
  blocks: WorkTemplatePrintBlock[]
  criticalTemplateIds: string[]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatCategoryName(name: string): string {
  return name.replace(/Prelliminary/gi, "Preliminary")
}

function durationLabel(days: number | null | undefined): string {
  if (days == null || Number.isNaN(days)) return "Duration not set"
  const n = Math.max(0, days)
  return n === 1 ? "1 working day" : `${n} working days`
}

function isCriticalItem(item: WorkTemplatePrintItem, criticalIds: Set<string>): boolean {
  return criticalIds.has(item.id) || item.isCriticalGate
}

function criticalBadges(item: WorkTemplatePrintItem, criticalIds: Set<string>): string {
  const parts: string[] = []
  if (criticalIds.has(item.id)) parts.push("Critical path")
  if (item.isCriticalGate) parts.push(item.gateName ? `Critical gate: ${item.gateName}` : "Critical gate")
  return parts.join(" · ")
}

/** Same category grouping/order as Settings → Work Items Template (without search filter). */
export function buildWorkTemplatePrintBlocks(
  templateCategoryRows: WorkTemplatePrintCategoryRow[],
  templates: WorkTemplatePrintItem[]
): Omit<WorkTemplatePrintData, "companyName" | "generatedAt" | "mode" | "criticalTemplateIds"> {
  const rowById = new Map<string, WorkTemplatePrintCategoryRow>()
  for (const c of templateCategoryRows) {
    rowById.set(c.id, c)
  }
  for (const t of templates) {
    const wc = t.workTemplateCategory
    if (wc && !rowById.has(wc.id)) {
      rowById.set(wc.id, {
        id: wc.id,
        name: wc.name,
        categoryPosition: wc.categoryPosition,
      })
    }
  }

  const byCatId = new Map(
    Array.from(rowById.values()).map((c) => [c.id, { row: c, items: [] as WorkTemplatePrintItem[] }])
  )

  for (const t of templates) {
    const cid = t.workTemplateCategoryId
    if (cid && byCatId.has(cid)) {
      byCatId.get(cid)!.items.push(t)
    }
  }

  const sortItems = (items: WorkTemplatePrintItem[]) =>
    [...items].sort((a, b) => {
      const dp = (a.itemPosition ?? 0) - (b.itemPosition ?? 0)
      if (dp !== 0) return dp
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.name.localeCompare(b.name)
    })

  let blocks = Array.from(byCatId.entries())
    .map(([id, { row, items }]) => ({
      id,
      row,
      items: sortItems(items),
    }))
    .sort((a, b) => a.row.categoryPosition - b.row.categoryPosition)

  const orphans = templates.filter((t) => {
    const cid = t.workTemplateCategoryId
    if (!cid) return true
    return !byCatId.has(cid)
  })

  if (orphans.length > 0) {
    blocks.push({
      id: "__orphan__",
      row: {
        id: "__orphan__",
        name: "Uncategorized",
        categoryPosition: 999_999,
      },
      items: sortItems(orphans),
    })
  }

  const categoryDurations: Record<string, number | null> = {}
  for (const block of blocks) {
    categoryDurations[block.row.name] = computeCategoryCriticalPathDuration(block.items)
  }

  const printBlocks: WorkTemplatePrintBlock[] = blocks
    .filter((b) => b.items.length > 0)
    .map((block, index) => ({
      id: block.id,
      categoryName: formatCategoryName(block.row.name),
      categoryIndex: index + 1,
      items: block.items,
      itemCount: block.items.length,
      workingDays: categoryDurations[block.row.name] ?? null,
    }))

  const totalWorkingDays = Object.values(categoryDurations).reduce<number>(
    (sum, d) => sum + (d ?? 0),
    0
  )

  return {
    totalCategories: printBlocks.length,
    totalWorkItems: templates.length,
    totalWorkingDays,
    blocks: printBlocks,
  }
}

function shortDurationLabel(days: number | null | undefined): string {
  if (days == null || Number.isNaN(days)) return "—"
  const n = Math.max(0, days)
  return n === 1 ? "1 day" : `${n} days`
}

function buildWorkingPrintHeader(data: WorkTemplatePrintData): string {
  const logoHtml = data.companyLogoUrl
    ? `<img src="${escapeHtml(data.companyLogoUrl)}" alt="" class="company-logo" />`
    : `<div class="company-name">${escapeHtml(data.companyName)}</div>`

  const totalDaysLabel =
    data.totalWorkingDays === 1
      ? "1 working day"
      : `${data.totalWorkingDays} working days`

  return `<header class="working-header">
    <div class="header-top">
      <div class="header-brand">${logoHtml}</div>
      <div class="header-title-block">
        <h1>Work Items Working Schedule</h1>
        <p class="header-meta">Generated: ${escapeHtml(data.generatedAt)} · Total working days: ${escapeHtml(totalDaysLabel)}</p>
      </div>
    </div>
    <div class="field-lines">
      <div class="field-line"><span class="field-label">Address:</span> <span class="field-blank"></span></div>
      <div class="field-line"><span class="field-label">Start Date:</span> <span class="field-blank field-blank-short"></span></div>
    </div>
  </header>`
}

function buildWorkingPrintBody(data: WorkTemplatePrintData): string {
  const criticalIds = new Set(data.criticalTemplateIds)
  let sequence = 0

  const bodyRows = data.blocks
    .map((block) => {
      const categoryRow = `<tr class="category-row">
        <td colspan="7">${escapeHtml(block.categoryName)}</td>
      </tr>`

      const itemRows = block.items
        .map((item) => {
          sequence += 1
          const critical = isCriticalItem(item, criticalIds)
          const name = critical ? `* ${item.name}` : item.name
          const duration = shortDurationLabel(item.defaultDurationDays)

          return `<tr class="item-row">
            <td class="col-seq">${sequence}</td>
            <td class="col-item">${escapeHtml(name)}</td>
            <td class="col-duration">${duration}</td>
            <td class="col-blank"></td>
            <td class="col-blank"></td>
            <td class="col-blank"></td>
            <td class="col-blank"></td>
          </tr>`
        })
        .join("")

      return categoryRow + itemRows
    })
    .join("")

  return `<table class="working-table">
    <thead>
      <tr>
        <th class="col-seq">Seq</th>
        <th class="col-item">Work Item</th>
        <th class="col-duration">Duration</th>
        <th class="col-blank">Called</th>
        <th class="col-blank">Scheduled</th>
        <th class="col-blank">Started</th>
        <th class="col-blank">Finished</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>`
}

function buildWorkingPrintDocument(data: WorkTemplatePrintData): string {
  const emptyBody =
    data.totalWorkItems === 0
      ? `<p class="empty">No work items in this template yet.</p>`
      : buildWorkingPrintBody(data)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Work Items Working Schedule</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 8px 10px 16px; font-size: 9px; line-height: 1.2; }
    .working-header { margin-bottom: 7px; border-bottom: 1px solid #000; padding-bottom: 6px; }
    .header-top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 5px; }
    .header-brand { flex-shrink: 0; }
    .header-title-block { flex: 1; min-width: 0; }
    .company-logo { max-height: 34px; max-width: 120px; width: auto; height: auto; object-fit: contain; display: block; }
    .company-name { font-size: 13px; font-weight: 700; line-height: 1.2; }
    h1 { font-size: 14px; margin: 0 0 1px; font-weight: 700; line-height: 1.2; }
    .header-meta { margin: 0; font-size: 10px; color: #333; line-height: 1.2; }
    .field-lines { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 4px; }
    .field-line { display: flex; align-items: baseline; gap: 4px; flex: 1; min-width: 180px; }
    .field-label { font-weight: 600; white-space: nowrap; font-size: 9px; }
    .field-blank { flex: 1; border-bottom: 1px solid #000; min-width: 120px; height: 12px; }
    .field-blank-short { max-width: 100px; min-width: 80px; flex: 0 1 100px; }
    .working-table { width: 100%; border-collapse: collapse; font-size: 8px; table-layout: fixed; }
    .working-table thead { display: table-header-group; }
    .working-table th, .working-table td { border: 1px solid #000; padding: 2px 3px; text-align: left; vertical-align: middle; line-height: 1.27; }
    .working-table th { background: #fff; font-weight: 700; font-size: 8px; padding: 3px 4px; min-height: 17px; }
    .category-row td { font-weight: 700; font-size: 8px; padding: 3px 4px; background: #fff; border-top: 1.5px solid #000; min-height: 13px; }
    .item-row { page-break-inside: avoid; min-height: 12px; }
    .col-seq { width: 6%; text-align: center; font-weight: 600; }
    .col-item { width: 34%; word-wrap: break-word; overflow-wrap: anywhere; }
    .col-duration { width: 10%; white-space: nowrap; font-size: 7px; }
    .col-blank { width: 12.5%; min-height: 12px; }
    .empty { text-align: center; color: #666; padding: 24px 0; font-size: 11px; }
    .footer { margin-top: 6px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 7px; color: #666; text-align: center; }
    @page { size: letter portrait; margin: 0.28in 0.32in 0.32in; }
    @media print {
      html, body { padding: 0; font-size: 8px; }
      .working-header { margin-bottom: 5px; padding-bottom: 5px; }
      .footer { margin-top: 4px; }
      .working-table thead { display: table-header-group; }
      .working-table th { padding: 3px 4px; min-height: 17px; }
      .working-table td { padding: 2px 3px; line-height: 1.27; }
      .item-row { page-break-inside: avoid; min-height: 12px; }
      .category-row { page-break-after: avoid; min-height: 13px; }
      .col-blank { min-height: 12px; }
    }
  </style>
</head>
<body>
  ${buildWorkingPrintHeader(data)}
  ${emptyBody}
  <div class="footer">Work Items Working Schedule · ${escapeHtml(data.companyName)} · ${escapeHtml(data.generatedAt)}</div>
</body>
</html>`
}

export function buildWorkTemplatePrintDocument(data: WorkTemplatePrintData): string {
  if (data.mode === "working") {
    return buildWorkingPrintDocument(data)
  }

  const criticalIds = new Set(data.criticalTemplateIds)
  let sequence = 0

  const categorySections = data.blocks
    .map((block) => {
      const categoryDays =
        block.workingDays == null ? "—" : `${block.workingDays} working day${block.workingDays === 1 ? "" : "s"}`

      const itemsHtml = block.items
        .map((item) => {
          sequence += 1
          const critical = isCriticalItem(item, criticalIds)
          const badges = criticalBadges(item, criticalIds)
          const duration = durationLabel(item.defaultDurationDays)

          if (data.mode === "compact") {
            const criticalSuffix = critical ? ` · ${badges || "Critical"}` : ""
            return `<li class="item compact"><span class="seq">${sequence}.</span> <span class="name">${escapeHtml(item.name)}</span> · ${duration}${criticalSuffix ? `<span class="critical">${escapeHtml(criticalSuffix.replace(/^ · /, ""))}</span>` : ""}</li>`
          }

          const deps =
            item.dependencies && item.dependencies.length > 0
              ? item.dependencies
                  .map((d) => d.dependsOnItem?.name)
                  .filter(Boolean)
                  .join(", ") || `${item.dependencies.length} item(s)`
              : "None"

          const trade = item.contractor
            ? `${item.contractor.companyName}${item.contractor.trade ? ` (${item.contractor.trade})` : ""}`
            : "—"

          const material = item.requiresOrdering ? "Yes" : "No"
          const leadDays = item.requiresOrdering
            ? item.materialLeadDays ?? 0
            : item.contractorLeadOverrideDays ?? item.contractor?.leadDays ?? item.prepLeadDays ?? 0

          const notes = item.isCriticalGate && item.gateName ? item.gateName : "—"

          return `<tr>
            <td class="seq">${sequence}</td>
            <td>${escapeHtml(item.name)}${critical ? `<div class="critical">${escapeHtml(badges || "Critical")}</div>` : ""}</td>
            <td>${duration}</td>
            <td>${escapeHtml(trade)}</td>
            <td>${material}</td>
            <td>${leadDays}</td>
            <td>${escapeHtml(deps)}</td>
            <td>${item.sortOrder}${item.sequenceOrder != null ? ` / ${item.sequenceOrder}` : ""}</td>
            <td>${escapeHtml(notes)}</td>
          </tr>`
        })
        .join("")

      if (data.mode === "compact") {
        return `<section class="category">
          <h2>${block.categoryIndex}. ${escapeHtml(block.categoryName)}</h2>
          <p class="category-meta">${block.itemCount} item${block.itemCount === 1 ? "" : "s"} · ${categoryDays}</p>
          <ol class="item-list">${itemsHtml}</ol>
        </section>`
      }

      return `<section class="category detailed">
        <h2>${block.categoryIndex}. ${escapeHtml(block.categoryName)}</h2>
        <p class="category-meta">${block.itemCount} item${block.itemCount === 1 ? "" : "s"} · ${categoryDays}</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Work item</th>
              <th>Duration</th>
              <th>Trade / contractor</th>
              <th>Material</th>
              <th>Lead days</th>
              <th>Dependencies</th>
              <th>Sort / display</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </section>`
    })
    .join("")

  const emptyBody =
    data.totalWorkItems === 0
      ? `<p class="empty">No work items in this template yet.</p>`
      : categorySections

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Work Items Template</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 0; padding: 24px 28px 48px; font-size: 12px; line-height: 1.45; }
    h1 { font-size: 22px; margin: 0 0 2px; font-weight: 700; }
    .subtitle { font-size: 16px; margin: 0 0 16px; color: #333; }
    .summary { color: #444; margin-bottom: 24px; line-height: 1.6; border-bottom: 1px solid #ccc; padding-bottom: 12px; }
    .summary div { margin: 2px 0; }
    h2 { font-size: 15px; margin: 0 0 4px; font-weight: 700; }
    .category { margin-top: 22px; page-break-inside: avoid; }
    .category.detailed { page-break-inside: auto; }
    .category-meta { margin: 0 0 10px; color: #555; font-size: 11px; }
    .item-list { margin: 0; padding-left: 1.25rem; }
    .item-list li { margin: 6px 0; }
    .item.compact .seq { font-weight: 600; }
    .critical { color: #9a3412; font-size: 10px; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
    th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; font-weight: 600; }
    tr { page-break-inside: avoid; }
    .empty { text-align: center; color: #666; padding: 48px 0; font-size: 14px; }
    .footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 10px; color: #666; text-align: center; }
    @media print {
      body { padding: 12px 16px 32px; }
      .category { page-break-before: auto; }
      .category + .category { page-break-before: auto; }
      .category.detailed table { page-break-inside: auto; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(data.companyName)}</h1>
  <p class="subtitle">Work Items Template${data.mode === "detailed" ? " — Detailed" : ""}</p>
  <div class="summary">
    <div><strong>Generated:</strong> ${escapeHtml(data.generatedAt)}</div>
    <div><strong>Total Categories:</strong> ${data.totalCategories}</div>
    <div><strong>Total Work Items:</strong> ${data.totalWorkItems}</div>
    <div><strong>Total Working Days:</strong> ${data.totalWorkingDays}</div>
  </div>
  ${emptyBody}
  <div class="footer">Work Items Template · ${escapeHtml(data.companyName)} · ${escapeHtml(data.generatedAt)}</div>
</body>
</html>`
}

/** Print HTML via a hidden iframe — avoids pop-up blockers from window.open(). */
export function printHtmlInHiddenFrame(html: string): void {
  if (typeof document === "undefined") return

  const iframe = document.createElement("iframe")
  iframe.setAttribute("title", "Work Items Template print preview")
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;"
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const doc = frameWindow?.document
  if (!doc || !frameWindow) {
    iframe.remove()
    throw new Error("Could not create print frame.")
  }

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1000)
  }

  const triggerPrint = () => {
    frameWindow.focus()
    frameWindow.print()
    cleanup()
  }

  doc.open()
  doc.write(html)
  doc.close()

  setTimeout(triggerPrint, 300)
}

export function printWorkTemplate(params: {
  companyName: string
  companyLogoUrl?: string | null
  mode: WorkTemplatePrintMode
  templateCategoryRows: WorkTemplatePrintCategoryRow[]
  templates: WorkTemplatePrintItem[]
  criticalTemplateIds?: string[]
}): void {
  const summary = buildWorkTemplatePrintBlocks(params.templateCategoryRows, params.templates)
  const data: WorkTemplatePrintData = {
    companyName: params.companyName,
    companyLogoUrl: params.companyLogoUrl,
    generatedAt: format(new Date(), "MMM d, yyyy"),
    mode: params.mode,
    criticalTemplateIds: params.criticalTemplateIds ?? [],
    ...summary,
  }

  printHtmlInHiddenFrame(buildWorkTemplatePrintDocument(data))
}

/** @deprecated Use printWorkTemplate — kept for compatibility. */
export function openWorkTemplatePrintWindow(
  params: Parameters<typeof printWorkTemplate>[0]
): boolean {
  try {
    printWorkTemplate(params)
    return true
  } catch {
    return false
  }
}
