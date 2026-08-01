import type { FlowAction, FlowHomeGroup, FlowUrgency } from "./types"
import { compareFlowUrgency } from "./selection"

const URGENCY_RANK: Record<FlowUrgency, number> = {
  OVERDUE: 0,
  AT_RISK: 1,
  READY: 2,
  FUTURE: 3,
}

/**
 * Group flat FlowActions by homeId (one action per home in inbox mode).
 * Sort groups by urgency: Overdue → At Risk → Ready → Future.
 */
export function groupFlowByHome(actions: FlowAction[]): FlowHomeGroup[] {
  const byHome = new Map<string, FlowAction[]>()
  for (const a of actions) {
    const key = a.homeId
    if (!byHome.has(key)) byHome.set(key, [])
    byHome.get(key)!.push(a)
  }

  const groups: FlowHomeGroup[] = []
  for (const [homeId, list] of byHome) {
    const sorted = [...list].sort((a, b) => compareFlowUrgency(a, b))
    const first = sorted[0]
    const prep = sorted.filter((x) => x.type === "PREP").length
    const execute = sorted.filter((x) => x.type === "EXECUTE").length
    const overdue = sorted.filter((x) => x.isOverdue || x.urgency === "OVERDUE").length
    groups.push({
      homeId,
      address: first.homeAddress,
      communityName: first.subdivisionName || undefined,
      actions: sorted,
      nextActionDate: first.actionDate,
      urgency: first.urgency,
      counts: { prep, execute, overdue },
      notStarted: first.notStarted ?? false,
    })
  }

  groups.sort((a, b) => {
    const ua = a.urgency ?? "FUTURE"
    const ub = b.urgency ?? "FUTURE"
    const ra = URGENCY_RANK[ua] ?? 99
    const rb = URGENCY_RANK[ub] ?? 99
    if (ra !== rb) return ra - rb
    const aDate = a.nextActionDate ?? ""
    const bDate = b.nextActionDate ?? ""
    return aDate.localeCompare(bDate)
  })

  return groups
}
