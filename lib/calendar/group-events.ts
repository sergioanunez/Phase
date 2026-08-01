/**
 * House-first calendar grouping (pure, memoizable).
 * Prefer one card per house; collapse same-named tasks across multiple houses.
 */

import type { CalendarEventType, EventStatus } from "@/components/calendar/event-row"

export type CalendarEventLike = {
  id: string
  date: string
  type: CalendarEventType
  title: string
  communityName?: string
  homeId?: string
  homeLabel?: string
  contractorName?: string
  status?: EventStatus
}

export type CalendarTaskLine = {
  id: string
  title: string
  type: CalendarEventType
  status?: EventStatus
}

export type CalendarHomeLine = {
  homeId: string
  homeLabel: string
  communityName?: string
  taskId: string
  status?: EventStatus
}

export type HouseCalendarHouseRow = {
  kind: "house"
  id: string
  homeId: string
  homeLabel: string
  communityName?: string
  contractorName?: string
  status?: EventStatus
  type: CalendarEventType
  tasks: CalendarTaskLine[]
}

export type HouseCalendarTaskHomesRow = {
  kind: "task-homes"
  id: string
  title: string
  type: CalendarEventType
  status?: EventStatus
  communityName?: string
  homes: CalendarHomeLine[]
}

export type HouseCalendarRow = HouseCalendarHouseRow | HouseCalendarTaskHomesRow

function worstStatus(statuses: (EventStatus | undefined)[]): EventStatus | undefined {
  if (statuses.some((s) => s === "overdue")) return "overdue"
  if (statuses.some((s) => s === "behind")) return "behind"
  if (statuses.some((s) => s === "at_risk")) return "at_risk"
  if (statuses.every((s) => s === "completed")) return "completed"
  return statuses.find((s) => s && s !== "completed") ?? statuses[0]
}

/**
 * Group a single day's events for house-first display.
 * 1) Same title+type across 2+ homes → expandable task-homes card
 * 2) Remaining events → one card per home with task bullets
 */
export function groupCalendarEventsByHouse(events: CalendarEventLike[]): HouseCalendarRow[] {
  if (events.length === 0) return []

  const byTitleType = new Map<string, CalendarEventLike[]>()
  for (const e of events) {
    const key = `${e.title}\0${e.type}`
    const list = byTitleType.get(key) ?? []
    list.push(e)
    byTitleType.set(key, list)
  }

  const consumed = new Set<string>()
  const taskHomeRows: HouseCalendarTaskHomesRow[] = []

  for (const [, list] of byTitleType) {
    const distinctHomes = new Set(list.map((e) => e.homeId).filter(Boolean))
    if (list.length >= 2 && distinctHomes.size >= 2) {
      for (const e of list) consumed.add(e.id)
      const homes: CalendarHomeLine[] = list
        .filter((e) => e.homeId && e.homeLabel)
        .map((e) => ({
          homeId: e.homeId!,
          homeLabel: e.homeLabel!,
          communityName: e.communityName,
          taskId: e.id,
          status: e.status,
        }))
        .sort((a, b) => a.homeLabel.localeCompare(b.homeLabel))

      taskHomeRows.push({
        kind: "task-homes",
        id: `task-homes-${list[0].type}-${list[0].title}-${list[0].id}`,
        title: list[0].title,
        type: list[0].type,
        status: worstStatus(list.map((e) => e.status)),
        communityName: list.find((e) => e.communityName)?.communityName,
        homes,
      })
    }
  }

  const remaining = events.filter((e) => !consumed.has(e.id))
  const byHome = new Map<string, CalendarEventLike[]>()
  for (const e of remaining) {
    const key = e.homeId ?? `orphan-${e.id}`
    const list = byHome.get(key) ?? []
    list.push(e)
    byHome.set(key, list)
  }

  const houseRows: HouseCalendarHouseRow[] = []
  for (const [, list] of byHome) {
    const primary = list[0]
    const homeId = primary.homeId
    const homeLabel = primary.homeLabel
    if (!homeId || !homeLabel) {
      // Orphan without home — still show as house-like single task
      houseRows.push({
        kind: "house",
        id: primary.id,
        homeId: primary.id,
        homeLabel: primary.title,
        communityName: primary.communityName,
        contractorName: primary.contractorName,
        status: primary.status,
        type: primary.type,
        tasks: list.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          status: e.status,
        })),
      })
      continue
    }

    const contractors = [
      ...new Set(list.map((e) => e.contractorName).filter(Boolean) as string[]),
    ]
    houseRows.push({
      kind: "house",
      id: `home-${homeId}-${list.map((e) => e.id).join("-")}`,
      homeId,
      homeLabel,
      communityName: primary.communityName,
      contractorName: contractors.length === 1 ? contractors[0] : contractors[0],
      status: worstStatus(list.map((e) => e.status)),
      type: list.length === 1 ? list[0].type : primary.type,
      tasks: list
        .map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          status: e.status,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    })
  }

  houseRows.sort((a, b) => {
    const sub = (a.communityName ?? "").localeCompare(b.communityName ?? "")
    if (sub !== 0) return sub
    return a.homeLabel.localeCompare(b.homeLabel)
  })

  taskHomeRows.sort((a, b) => a.title.localeCompare(b.title))

  // Task-across-homes first (shared work across sites), then house cards
  return [...taskHomeRows, ...houseRows]
}

export type WeekSummaryCounts = {
  houses: number
  tasks: number
  deliveries: number
  inspections: number
}

/** Summary counts for the filtered event set (respects active filter input). */
export function summarizeCalendarEvents(events: CalendarEventLike[]): WeekSummaryCounts {
  const homes = new Set<string>()
  for (const e of events) {
    if (e.homeId) homes.add(e.homeId)
  }
  return {
    houses: homes.size,
    tasks: events.length,
    deliveries: events.filter((e) => e.type === "delivery").length,
    inspections: events.filter((e) => e.type === "inspection").length,
  }
}

export function formatWeekSummary(counts: WeekSummaryCounts): string {
  const parts = [
    `${counts.houses} House${counts.houses === 1 ? "" : "s"}`,
    `${counts.tasks} Task${counts.tasks === 1 ? "" : "s"}`,
    `${counts.deliveries} Deliver${counts.deliveries === 1 ? "y" : "ies"}`,
    `${counts.inspections} Inspection${counts.inspections === 1 ? "" : "s"}`,
  ]
  return parts.join(" · ")
}
