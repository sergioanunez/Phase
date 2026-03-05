import type { FlowAction, FlowHomeGroup } from "./types"

/**
 * Group flat FlowActions by homeId. Within each group sort by:
 * 1) overdue first
 * 2) actionDate asc
 * 3) EXECUTE before PREP when same date
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
    const sorted = [...list].sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      if (a.actionDate !== b.actionDate) return a.actionDate.localeCompare(b.actionDate)
      return a.type === "EXECUTE" && b.type === "PREP" ? -1 : a.type === "PREP" && b.type === "EXECUTE" ? 1 : 0
    })
    const first = sorted[0]
    const prep = sorted.filter((x) => x.type === "PREP").length
    const execute = sorted.filter((x) => x.type === "EXECUTE").length
    const overdue = sorted.filter((x) => x.isOverdue).length
    groups.push({
      homeId,
      address: first.homeAddress,
      communityName: first.subdivisionName || undefined,
      actions: sorted,
      nextActionDate: first.actionDate,
      counts: { prep, execute, overdue },
      notStarted: first.notStarted ?? false,
    })
  }

  groups.sort((a, b) => {
    if (a.notStarted && !b.notStarted) return -1
    if (!a.notStarted && b.notStarted) return 1
    const aOverdue = a.counts.overdue
    const bOverdue = b.counts.overdue
    if (aOverdue !== bOverdue) return bOverdue - aOverdue
    const aDate = a.nextActionDate ?? ""
    const bDate = b.nextActionDate ?? ""
    return aDate.localeCompare(bDate)
  })

  return groups
}
