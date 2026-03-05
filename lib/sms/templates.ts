import { format } from "date-fns"
import {
  isWhiteLabelExperienceEnabled,
  type WhiteLabelSubscriptionLike,
} from "@/lib/branding/whiteLabel"

export type SmsBrandTenant = {
  brandAppName?: string | null
  name?: string | null
} | null | undefined

export function getBrand(
  tenant: SmsBrandTenant,
  subscription?: WhiteLabelSubscriptionLike | null
): string {
  const displayName = (tenant?.name || tenant?.brandAppName || "").trim()
  if (subscription && isWhiteLabelExperienceEnabled(subscription) && displayName) {
    return displayName
  }
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
  return `${brand} scheduled:
${params.taskName}
${params.address}
Date: ${dateStr}

Y = Confirm
N = Reschedule
Ref: ${params.ref}

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
}): string {
  const brand = getBrand(params.tenant, params.subscription)
  const dateStr = formatDate(params.date)
  const dueStr = params.dueDate ? formatDate(params.dueDate) : "—"

  const allItems = params.items.length > 0 ? params.items : ["(no items)"]

  const formatItems = (items: string[]) =>
    items
      .map((item, idx) => `${idx + 1}) ${item}`)
      .join("\n")

  let itemsText = formatItems(allItems)
  let body = `${brand} punchlist:
${params.address}
Date: ${dateStr}
Due: ${dueStr}

Please address these items:
${itemsText}

STOP to opt out. HELP for help.`

  if (body.length > 1400) {
    const truncatedItems = allItems.slice(0, 8)
    itemsText = formatItems(truncatedItems)
    body = `${brand} punchlist:
${params.address}
Date: ${dateStr}
Due: ${dueStr}

Please address these items:
${itemsText}

...
More items in Phase.

STOP to opt out. HELP for help.`
  }

  return body
}

