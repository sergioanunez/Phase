import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { getBaseUrl } from "@/lib/url"
import { isWebPushConfigured } from "@/lib/web-push-config"
import { sendWebPushToSubscription, type WebPushNotificationPayload } from "@/lib/web-push-send"

const BUILDER_ROLES = ["Admin", "Manager", "Superintendent"] as const

const DEDUP_SMS_MS = 120_000
const DEDUP_FLOW_MS = 4 * 60 * 60 * 1000
const DEDUP_PUNCH_MS = 300_000

async function pruneOldDedup(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  await prisma.webPushDedup.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {})
}

async function shouldDedup(key: string, windowMs: number): Promise<boolean> {
  await pruneOldDedup()
  const since = new Date(Date.now() - windowMs)
  const existing = await prisma.webPushDedup.findFirst({
    where: { key, createdAt: { gte: since } },
  })
  if (existing) return true
  try {
    await prisma.webPushDedup.create({ data: { key } })
  } catch {
    return true
  }
  return false
}

function absoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl
  }
  const base = getBaseUrl().replace(/\/$/, "")
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${path}`
}

type Category = "subcontractor_reply" | "flow_attention" | "punchlist"

async function prefsAllow(
  userId: string,
  companyId: string,
  category: Category
): Promise<boolean> {
  const p = await prisma.userWebPushPreference.findUnique({
    where: { userId_companyId: { userId, companyId } },
  })
  if (!p) return true
  if (!p.enabled) return false
  switch (category) {
    case "subcontractor_reply":
      return p.notifySubcontractorReply
    case "flow_attention":
      return p.notifyFlowAlerts
    case "punchlist":
      return p.notifyPunchlist
    default:
      return true
  }
}

async function sendToCompanyBuilders(
  companyId: string,
  category: Category,
  payload: WebPushNotificationPayload
): Promise<void> {
  if (!isWebPushConfigured()) return

  const subs = await prisma.webPushSubscription.findMany({
    where: {
      companyId,
      isActive: true,
      user: {
        companyId,
        isActive: true,
        role: { in: [...BUILDER_ROLES] },
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      userId: true,
    },
  })

  const url = absoluteUrl(payload.url)

  for (const sub of subs) {
    if (!(await prefsAllow(sub.userId, companyId, category))) continue
    await sendWebPushToSubscription(sub, { ...payload, url })
  }
}

/** Send to one builder’s active subscriptions only (Flow is scoped per user / home assignments). */
async function sendToUserBuilderDevices(
  companyId: string,
  targetUserId: string,
  category: Category,
  payload: WebPushNotificationPayload
): Promise<void> {
  if (!isWebPushConfigured()) return
  if (!(await prefsAllow(targetUserId, companyId, category))) return

  const subs = await prisma.webPushSubscription.findMany({
    where: {
      companyId,
      userId: targetUserId,
      isActive: true,
      user: {
        companyId,
        isActive: true,
        role: { in: [...BUILDER_ROLES] },
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      userId: true,
    },
  })

  const url = absoluteUrl(payload.url)
  for (const sub of subs) {
    await sendWebPushToSubscription(sub, { ...payload, url })
  }
}

/** After contractor SMS / magic-link confirmation (deduped per task). */
export async function dispatchWebPushSubcontractorReply(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  confirmed: boolean
  contractorName?: string
}): Promise<void> {
  const { companyId, homeId, taskId, taskName, homeLabel, confirmed, contractorName } = params
  if (!confirmed) return

  const dedupKey = `sms-reply:${companyId}:${taskId}:y`
  if (await shouldDedup(dedupKey, DEDUP_SMS_MS)) return

  const contractor = (contractorName ?? "Contractor").trim() || "Contractor"
  const title = "Task confirmed"
  const body = `${contractor} confirmed ${taskName} at ${homeLabel}.`

  await sendToCompanyBuilders(companyId, "subcontractor_reply", {
    title,
    body,
    type: "subcontractor_reply",
    url: `/homes/${homeId}?task=${taskId}`,
    tag: `task-${taskId}-sms`,
    metadata: { homeId, taskId },
  })
}

/** Contractor requested a reschedule (Unavailable / SMS N). */
export async function dispatchWebPushRescheduleRequest(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  contractorName: string
  proposedDateLabel?: string | null
  dedupSuffix: string
}): Promise<void> {
  const {
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    contractorName,
    proposedDateLabel,
    dedupSuffix,
  } = params

  const dedupKey = `reschedule-request:${companyId}:${dedupSuffix}`
  if (await shouldDedup(dedupKey, DEDUP_SMS_MS)) return

  const contractor = contractorName.trim() || "Contractor"
  const body = proposedDateLabel
    ? `${contractor} requested ${proposedDateLabel} for ${taskName} at ${homeLabel}.`
    : `${contractor} requested a new date for ${taskName} at ${homeLabel}.`

  await sendToCompanyBuilders(companyId, "subcontractor_reply", {
    title: "Reschedule requested",
    body,
    type: "subcontractor_reply",
    url: `/homes/${homeId}?task=${taskId}`,
    tag: `task-${taskId}-reschedule-request`,
    metadata: { homeId, taskId },
  })
}

/**
 * Flow needs attention today for this user’s view (Superintendent = assigned homes only;
 * Admin/Manager = company-wide). Dedup per user + fingerprint, 4h.
 */
export async function dispatchWebPushFlowAttention(params: {
  companyId: string
  /** Recipient: only their subscriptions receive the push. */
  targetUserId: string
  attentionTaskIds: string[]
  attentionHomeCount: number
}): Promise<void> {
  const { companyId, targetUserId, attentionTaskIds, attentionHomeCount } = params
  if (attentionTaskIds.length === 0 || attentionHomeCount < 1) return

  const sorted = [...attentionTaskIds].sort()
  const fp = createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 24)
  const dedupKey = `flow:${companyId}:${targetUserId}:${fp}`
  if (await shouldDedup(dedupKey, DEDUP_FLOW_MS)) return

  const n = attentionHomeCount
  const body =
    n === 1
      ? "1 home needs action on Flow today."
      : `${n} homes need action on Flow today.`

  await sendToUserBuilderDevices(companyId, targetUserId, "flow_attention", {
    title: "Flow needs attention",
    body,
    type: "flow_attention",
    url: "/flow",
    tag: `flow-${companyId}-${targetUserId.slice(0, 8)}-${fp.slice(0, 8)}`,
    metadata: { homeCount: String(n) },
  })
}

/** Punchlist-related (new items on task or item completed). */
export async function dispatchWebPushPunchlist(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  title: string
  body: string
  dedupSuffix: string
}): Promise<void> {
  const { companyId, homeId, taskId, taskName: _taskName, homeLabel: _homeLabel, title, body, dedupSuffix } =
    params
  const dedupKey = `punch:${companyId}:${dedupSuffix}`
  if (await shouldDedup(dedupKey, DEDUP_PUNCH_MS)) return

  await sendToCompanyBuilders(companyId, "punchlist", {
    title,
    body,
    type: "punchlist",
    url: `/homes/${homeId}?task=${taskId}`,
    tag: `punch-${taskId}`,
    metadata: { homeId, taskId },
  })
}
