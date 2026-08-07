/**
 * Group PunchItems into persistent PunchLists + a legacy ungrouped bucket.
 * Pure / UI-safe — no DB.
 */

import {
  countClosedPunchItems,
  countOpenPunchItems,
  isPunchItemOpenStatus,
} from "@/lib/punch/punch-list"

export type PunchListGroupItem = {
  id: string
  title: string
  status: string
  punchListId?: string | null
  assignedContractorId?: string | null
  assignedContractor?: { id: string; companyName: string } | null
  dueDate?: string | null
  [key: string]: unknown
}

export type PunchListGroup = {
  /** Real PunchList id, or "legacy" for ungrouped items */
  id: string
  kind: "list" | "legacy"
  contractorName: string
  assignedContractorId: string | null
  dueDate: string | null
  items: PunchListGroupItem[]
  openCount: number
  closedCount: number
  totalCount: number
}

export function groupPunchItemsByList(
  items: PunchListGroupItem[]
): PunchListGroup[] {
  const lists = new Map<
    string,
    {
      id: string
      contractorName: string
      assignedContractorId: string | null
      dueDate: string | null
      items: PunchListGroupItem[]
    }
  >()
  const legacy: PunchListGroupItem[] = []

  for (const item of items) {
    const listId = item.punchListId
    const listMeta = item.punchList as
      | {
          id: string
          dueDate?: string | null
          assignedContractorId?: string | null
          assignedContractor?: { id: string; companyName: string } | null
        }
      | null
      | undefined

    if (listId && listMeta) {
      const existing = lists.get(listId)
      if (existing) {
        existing.items.push(item)
      } else {
        lists.set(listId, {
          id: listId,
          contractorName:
            listMeta.assignedContractor?.companyName ??
            item.assignedContractor?.companyName ??
            "Unassigned contractor",
          assignedContractorId:
            listMeta.assignedContractorId ?? item.assignedContractorId ?? null,
          dueDate: listMeta.dueDate ?? item.dueDate ?? null,
          items: [item],
        })
      }
    } else {
      legacy.push(item)
    }
  }

  const groups: PunchListGroup[] = [...lists.values()].map((g) => ({
    id: g.id,
    kind: "list" as const,
    contractorName: g.contractorName,
    assignedContractorId: g.assignedContractorId,
    dueDate: g.dueDate,
    items: g.items,
    openCount: countOpenPunchItems(g.items),
    closedCount: countClosedPunchItems(g.items),
    totalCount: g.items.length,
  }))

  groups.sort((a, b) => a.contractorName.localeCompare(b.contractorName))

  if (legacy.length > 0) {
    groups.push({
      id: "legacy",
      kind: "legacy",
      contractorName: "Unassigned / Legacy",
      assignedContractorId: null,
      dueDate: null,
      items: legacy,
      openCount: countOpenPunchItems(legacy),
      closedCount: countClosedPunchItems(legacy),
      totalCount: legacy.length,
    })
  }

  return groups
}

export type PunchListFilter = "all" | "open" | "closed"

/**
 * Apply All / Open / Closed in a list-aware way (no duplicate lists).
 */
export function filterPunchListGroups(
  groups: PunchListGroup[],
  filter: PunchListFilter
): PunchListGroup[] {
  if (filter === "all") return groups

  return groups
    .map((g) => {
      if (filter === "open") {
        const items = g.items.filter((i) => isPunchItemOpenStatus(i.status))
        if (items.length === 0) return null
        return {
          ...g,
          items,
          openCount: items.length,
          closedCount: 0,
          totalCount: items.length,
        }
      }
      // closed: lists that have closed items; for full lists show only closed
      const items = g.items.filter(
        (i) => i.status === "Closed" || i.status === "Canceled"
      )
      if (items.length === 0) return null
      // Prefer fully-closed lists in Closed filter; still show partial closed items
      return {
        ...g,
        items,
        openCount: 0,
        closedCount: items.length,
        totalCount: items.length,
      }
    })
    .filter((g): g is PunchListGroup => g != null)
}
