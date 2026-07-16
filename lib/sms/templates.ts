import { format } from "date-fns"
import type { WhiteLabelSubscriptionLike } from "@/lib/branding/whiteLabel"

export type SmsBrandTenant = {
  brandAppName?: string | null
  name?: string | null
} | null | undefined

/**
 * Builder-facing SMS (schedule confirm, cancel, punchlist) uses the tenant company name when known.
 * Falls back to "Phase" only when there is no tenant context (e.g. missing company on task/home).
 */
export function getBrand(
  tenant: SmsBrandTenant,
  _subscription?: WhiteLabelSubscriptionLike | null
): string {
  const displayName = (tenant?.name || tenant?.brandAppName || "").trim()
  if (displayName) return displayName
  return "Phase"
}

export function formatDate(date: Date): string {
  return format(date, "MMM d, yyyy")
}

export function buildScheduledSms(params: {
  tenant: SmsBrandTenant
  subscription?: WhiteLabelSubscriptionLike | null
  taskName: string
  address: string
  date: Date
  ref: string
}): string {
  const brand = getBrand(params.tenant, params.subscription)
  const dateStr = formatDate(params.date)
  return `${brand}

${params.taskName} at ${params.address} is scheduled for ${dateStr}.

Reply Y to confirm or N if unavailable.
Ref: ${params.ref}

STOP to opt out. HELP for help.`
}

/** When a trade has 2+ open PendingConfirm requests for this phone. */
export function buildMultiPendingConfirmationsSms(params: {
  tenant: SmsBrandTenant
  subscription?: WhiteLabelSubscriptionLike | null
  pendingCount: number
  magicLink: string
}): string {
  const brand = getBrand(params.tenant, params.subscription)
  const count = Math.max(2, params.pendingCount)
  return `${brand}

You have ${count} pending work confirmations.

Review and respond here:
${params.magicLink}

STOP to opt out. HELP for help.`
}

export function buildCancelledSms(params: {
  tenant: SmsBrandTenant
  subscription?: WhiteLabelSubscriptionLike | null
  taskName: string
  address: string
  date: Date
  ref: string
}): string {
  const brand = getBrand(params.tenant, params.subscription)
  const dateStr = formatDate(params.date)
  return `${brand} cancelled:
${params.taskName}
${params.address}
Date: ${dateStr}

Sorry for the inconvenience.
Ref: ${params.ref}

STOP to opt out. HELP for help.`
}

export function buildPunchlistSms(params: {
  tenant: SmsBrandTenant
  subscription?: WhiteLabelSubscriptionLike | null
  address: string
  date: Date
  dueDate?: Date | null
  items: string[]
  /** Secure public link for photos & full list. Temporarily not included in SMS (A2P 10DLC). */
  publicLink?: string | null
}): string {
  const brand = getBrand(params.tenant, params.subscription)
  const dateStr = formatDate(params.date)
  const dueStr = params.dueDate ? formatDate(params.dueDate) : "—"

  const allItems = params.items.length > 0 ? params.items : ["(no items)"]

  const formatItems = (items: string[]) =>
    items
      .map((item, idx) => `${idx + 1}) ${item}`)
      .join("\n")

  // Temporary: do not include link in SMS to reduce filtering while A2P 10DLC is pending.
  const linkBlock = "\n"

  let itemsText = formatItems(allItems)
  let body = `${brand} punchlist:
${params.address}
Date: ${dateStr}
Due: ${dueStr}

${itemsText}
${linkBlock}STOP to opt out. HELP for help.`

  if (body.length > 1400) {
    const truncatedItems = allItems.slice(0, 8)
    itemsText = formatItems(truncatedItems)
    body = `${brand} punchlist:
${params.address}
Date: ${dateStr}
Due: ${dueStr}

${itemsText}

...
More items in ${brand}.
${linkBlock}STOP to opt out. HELP for help.`
  }

  return body
}

