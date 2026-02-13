/**
 * WhatsApp share helpers. Use from client only for openWhatsAppShare.
 * NEXT_PUBLIC_APP_URL should be set (e.g. https://usephase.app) for correct deep links.
 */

const MAX_PUNCH_ITEMS_IN_MESSAGE = 10

function formatDate(value: string | Date | null | undefined): string {
  if (value == null) return ""
  const d = typeof value === "string" ? new Date(value) : value
  if (isNaN(d.getTime())) return ""
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const year = d.getFullYear()
  return `${month}/${day}/${year}`
}

/** Base URL for deep links. Prefer NEXT_PUBLIC_APP_URL; on client falls back to window.location.origin. */
export function getAppBaseUrl(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  }
  if (typeof window !== "undefined") {
    return window.location.origin
  }
  return ""
}

export interface PunchlistWhatsAppInput {
  contextLabel?: string
  homeLabel?: string
  taskName?: string
  punchItems: { title: string }[]
  dueDate?: string | Date | null
  homeId: string
}

/**
 * Builds the WhatsApp message text for sharing a punch list.
 * Caps punch items at first 10, then "+ N more…".
 */
export function buildPunchlistWhatsAppText(
  input: PunchlistWhatsAppInput,
  baseUrl?: string
): string {
  const base = baseUrl ?? getAppBaseUrl()
  const lines: string[] = []

  const header = [input.contextLabel, input.homeLabel].filter(Boolean).join(" – ")
  if (header) lines.push(header)

  lines.push("Punch List – " + input.punchItems.length + " item(s)")
  lines.push("")

  const capped = input.punchItems.slice(0, MAX_PUNCH_ITEMS_IN_MESSAGE)
  capped.forEach((item) => {
    lines.push("• " + (item.title || "Untitled"))
  })
  if (input.punchItems.length > MAX_PUNCH_ITEMS_IN_MESSAGE) {
    lines.push("+ " + (input.punchItems.length - MAX_PUNCH_ITEMS_IN_MESSAGE) + " more…")
  }

  const dueStr = formatDate(input.dueDate)
  if (dueStr) {
    lines.push("")
    lines.push("Due: " + dueStr)
  }

  const viewUrl = base ? `${base}/homes/${input.homeId}?tab=punchlist` : ""
  if (viewUrl) {
    lines.push("")
    lines.push("View in Phase: " + viewUrl)
  }

  return lines.join("\n")
}

export interface WorkItemWhatsAppInput {
  contextLabel?: string
  homeLabel?: string
  taskName: string
  status: string
  scheduledDate?: string | Date | null
  contractorName?: string | null
  homeId: string
  taskId: string
}

/**
 * Builds the WhatsApp message text for sharing a single work item.
 */
export function buildWorkItemWhatsAppText(
  input: WorkItemWhatsAppInput,
  baseUrl?: string
): string {
  const base = baseUrl ?? getAppBaseUrl()
  const lines: string[] = []

  const header = [input.contextLabel, input.homeLabel].filter(Boolean).join(" – ")
  if (header) lines.push(header)

  lines.push("Task: " + (input.taskName || "Untitled"))
  if (input.status) lines.push("Status: " + input.status)

  const scheduledStr = formatDate(input.scheduledDate)
  if (scheduledStr) lines.push("Scheduled: " + scheduledStr)
  if (input.contractorName) lines.push("Contractor: " + input.contractorName)

  const viewUrl = base ? `${base}/homes/${input.homeId}/tasks/${input.taskId}` : ""
  if (viewUrl) {
    lines.push("")
    lines.push("View in Phase: " + viewUrl)
  }

  return lines.join("\n")
}

const WHATSAPP_URL = "https://wa.me"

/**
 * Opens WhatsApp (web or app) with the given message. Client-only; call from event handlers.
 */
export function openWhatsAppShare(text: string): void {
  if (typeof window === "undefined") return
  const url = `${WHATSAPP_URL}/?text=${encodeURIComponent(text)}`
  window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * Opens the default mail client with pre-filled subject and body. Client-only.
 * Reuse the same message text from buildPunchlistWhatsAppText / buildWorkItemWhatsAppText for body.
 */
export function openEmailShare(body: string, subject?: string): void {
  if (typeof window === "undefined") return
  const params = new URLSearchParams()
  if (subject) params.set("subject", subject)
  params.set("body", body)
  window.open(`mailto:?${params.toString()}`, "_blank", "noopener,noreferrer")
}
