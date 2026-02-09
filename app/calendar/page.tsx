"use client"

import { useEffect, useState, useMemo } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  isToday,
  parseISO,
  startOfDay,
} from "date-fns"
import { ChevronLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { SegmentedControl, type CalendarViewMode } from "@/components/calendar/segmented-control"
import { FilterChipsRow } from "@/components/calendar/filter-chips-row"
import { WeekHeaderCard } from "@/components/calendar/week-header-card"
import { DayCard } from "@/components/calendar/day-card"
import { MonthGrid } from "@/components/calendar/month-grid"
import { DayDetailList } from "@/components/calendar/day-detail-list"
import { EventRow, type EventRowData, type CalendarEventType } from "@/components/calendar/event-row"

interface CalendarEvent {
  id: string
  date: string
  type: CalendarEventType
  title: string
  communityName?: string
  homeCount?: number
  homeId?: string
  homeLabel?: string
  status?: EventRowData["status"]
}

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]

const BASE_FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "inspection", label: "Inspections" },
  { id: "delivery", label: "Deliveries" },
  { id: "trade", label: "Trades" },
]
const MANAGER_RISK_CHIPS = [
  { id: "at_risk", label: "At Risk" },
  { id: "behind", label: "Behind" },
]

function toEventRowData(e: CalendarEvent): EventRowData {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    status: e.status,
    homeCount: e.homeCount,
    homeId: e.homeId,
    homeLabel: e.homeLabel,
    communityName: e.communityName,
  }
}

function aggregateEventsByTitle(events: CalendarEvent[]): EventRowData[] {
  const byKey = new Map<string, { events: CalendarEvent[] }>()
  for (const e of events) {
    const key = `${e.title}|${e.type}`
    if (!byKey.has(key)) byKey.set(key, { events: [] })
    byKey.get(key)!.events.push(e)
  }
  const rows: EventRowData[] = []
  byKey.forEach(({ events: list }) => {
    if (list.length === 1) {
      rows.push(toEventRowData(list[0]))
    } else {
      rows.push({
        id: list[0].id,
        title: list[0].title,
        type: list[0].type,
        status: list.some((x) => x.status === "overdue") ? "overdue" : list[0].status,
        homeCount: list.length,
        communityName: list[0].communityName,
      })
    }
  })
  return rows.sort((a, b) => (a.title > b.title ? 1 : -1))
}

export default function CalendarPage() {
  const { data: session } = useSession()
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week")
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [filterChip, setFilterChip] = useState<string | null>("all")
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [dayDetailOpen, setDayDetailOpen] = useState(false)
  const [dayDetailDate, setDayDetailDate] = useState<Date>(new Date())
  const [subdivisions, setSubdivisions] = useState<{ id: string; name: string }[]>([])
  const [communityFilter, setCommunityFilter] = useState<string | null>(null)

  const filterChips = useMemo(() => {
    const role = session?.user?.role
    const showRisk = role === "Admin" || role === "Manager"
    return showRisk
      ? [...BASE_FILTER_CHIPS, ...MANAGER_RISK_CHIPS]
      : BASE_FILTER_CHIPS
  }, [session?.user?.role])

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn: 1 }),
    [weekAnchor]
  )
  const weekEnd = useMemo(() => endOfWeek(weekAnchor, { weekStartsOn: 1 }), [weekAnchor])
  const fetchStart = useMemo(() => {
    const s = new Date(weekStart)
    s.setDate(s.getDate() - 7)
    return s
  }, [weekStart])
  const fetchEnd = useMemo(() => {
    const e = new Date(weekEnd)
    e.setDate(e.getDate() + 14)
    return e
  }, [weekEnd])

  useEffect(() => {
    const params = new URLSearchParams({
      start: fetchStart.toISOString(),
      end: fetchEnd.toISOString(),
    })
    if (communityFilter) params.set("subdivisionId", communityFilter)
    fetch(`/api/calendar/events?${params}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data)
        else setEvents([])
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [fetchStart.toISOString(), fetchEnd.toISOString(), communityFilter])

  useEffect(() => {
    fetch("/api/subdivisions", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setSubdivisions(data) : []))
      .catch(() => {})
  }, [])

  const filteredEvents = useMemo(() => {
    if (!filterChip || filterChip === "all") return events
    return events.filter((e) => e.type === filterChip)
  }, [events, filterChip])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    filteredEvents.forEach((e) => {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    })
    return map
  }, [filteredEvents])

  const weekDayCards = useMemo(() => {
    const days: { date: Date; label: string; events: EventRowData[] }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i)
      const key = format(d, "yyyy-MM-dd")
      const dayEvents = eventsByDate[key] ?? []
      days.push({
        date: d,
        label: format(d, "EEE, MMM d"),
        events: aggregateEventsByTitle(dayEvents),
      })
    }
    return days
  }, [weekStart, eventsByDate])

  const todayKey = format(selectedDate, "yyyy-MM-dd")
  const dayEvents = eventsByDate[todayKey] ?? []
  const dayOverdue = useMemo(() => {
    const today = startOfDay(new Date())
    return filteredEvents.filter(
      (e) => parseISO(e.date) < today && e.status !== "completed"
    )
  }, [filteredEvents])
  const dayDueToday = useMemo(() => {
    return dayEvents.filter((e) => e.status !== "completed")
  }, [dayEvents])
  const dayUpcoming = useMemo(() => {
    const today = startOfDay(new Date())
    const nextWeek = addDays(today, 8)
    return filteredEvents.filter((e) => {
      const d = parseISO(e.date)
      return d > today && d < nextWeek
    })
  }, [filteredEvents])

  const eventsCountForMonth = useMemo(() => {
    const map: Record<string, number> = {}
    filteredEvents.forEach((e) => {
      map[e.date] = (map[e.date] ?? 0) + 1
    })
    return map
  }, [filteredEvents])

  const weekEvents = useMemo(
    () =>
      filteredEvents.filter((e) => {
        const d = parseISO(e.date)
        return d >= weekStart && d <= weekEnd
      }),
    [filteredEvents, weekStart, weekEnd]
  )
  const totalEventsThisWeek = weekEvents.length
  const inspectionCount = weekEvents.filter((e) => e.type === "inspection").length
  const atRiskCount = weekEvents.filter(
    (e) => e.status === "at_risk" || e.status === "behind"
  ).length

  const handleDayDetail = (date: Date) => {
    setDayDetailDate(date)
    setDayDetailOpen(true)
  }

  const dayDetailEvents: EventRowData[] = useMemo(() => {
    if (!dayDetailOpen) return []
    const key = format(dayDetailDate, "yyyy-MM-dd")
    const list = eventsByDate[key] ?? []
    return list.map(toEventRowData)
  }, [dayDetailOpen, dayDetailDate, eventsByDate])

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Calendar
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Calendar</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            View and manage scheduled work by date. Filter by inspection type or contractor.
          </p>
        </div>

        <div className="sticky top-16 z-10 mb-4 flex flex-col rounded-2xl border border-[#E6E8EF] bg-[#F6F7F9] p-3 shadow-sm">
          <div className="flex justify-center">
            <SegmentedControl
            value={viewMode}
            onChange={(mode) => {
              setViewMode(mode)
              if (mode === "day") setSelectedDate(new Date())
            }}
            options={VIEW_OPTIONS}
          />
        </div>

          <FilterChipsRow
          chips={filterChips}
          selectedId={filterChip}
          onSelect={setFilterChip}
          />
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : viewMode === "week" ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setWeekAnchor(subWeeks(weekAnchor, 1))}
                className="rounded-lg p-2 text-muted-foreground hover:bg-white"
              >
                ‹
              </button>
              <span className="text-sm font-medium">
                {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
              </span>
              <button
                type="button"
                onClick={() => setWeekAnchor(addWeeks(weekAnchor, 1))}
                className="rounded-lg p-2 text-muted-foreground hover:bg-white"
              >
                ›
              </button>
            </div>
            <WeekHeaderCard
              dateRange={`${format(weekStart, "MMM d")}–${format(weekEnd, "MMM d")}`}
              summary={`Today: ${totalEventsThisWeek} events • ${inspectionCount} inspections`}
              atRiskCount={atRiskCount > 0 ? atRiskCount : undefined}
            />
            <div className="mt-4 space-y-4">
              {weekDayCards.map((day) => {
                const dateKey = format(day.date, "yyyy-MM-dd")
                const rawCount = eventsByDate[dateKey]?.length ?? 0
                return (
                  <DayCard
                    key={day.label}
                    dayLabel={day.label}
                    events={day.events}
                    maxVisible={6}
                    viewAllCount={rawCount}
                    onViewAll={() => handleDayDetail(day.date)}
                  />
                )
              })}
            </div>
          </>
        ) : viewMode === "day" ? (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">
                {isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE")},{" "}
                {format(selectedDate, "MMMM d")}
              </h2>
              {subdivisions.length > 0 && (
                <select
                  value={communityFilter ?? ""}
                  onChange={(e) => setCommunityFilter(e.target.value || null)}
                  className="mt-2 rounded-xl border border-[#E6E8EF] bg-white px-4 py-2.5 text-sm"
                >
                  <option value="">All Communities</option>
                  {subdivisions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-4">
              {dayOverdue.length > 0 && (
                <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-semibold text-foreground">Overdue</span>
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      {dayOverdue.length}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {dayOverdue.slice(0, 8).map((e) => (
                      <li key={e.id}>
                        <EventRow
                          event={{ ...toEventRowData(e), badge: "Overdue", status: "overdue" }}
                          showChevron
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                <div className="mb-3 font-semibold text-foreground">Due Today</div>
                {dayDueToday.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No events due today</p>
                ) : (
                  <ul className="space-y-1">
                    {dayDueToday.map((e) => (
                      <li key={e.id}>
                        <EventRow event={toEventRowData(e)} showChevron />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                <div className="mb-3 font-semibold text-foreground">Upcoming</div>
                {dayUpcoming.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No upcoming events</p>
                ) : (
                  <ul className="space-y-1">
                    {dayUpcoming.slice(0, 8).map((e) => (
                      <li key={e.id}>
                        <EventRow
                          event={{
                            ...toEventRowData(e),
                            dateLabel: format(parseISO(e.date), "MMM d"),
                          }}
                          showChevron
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <MonthGrid
              current={weekAnchor}
              eventsByDate={Object.fromEntries(
                Object.entries(eventsCountForMonth).map(([k, v]) => [k, v])
              )}
              onSelectDay={(date) => {
                setWeekAnchor(startOfWeek(date, { weekStartsOn: 1 }))
                setViewMode("week")
              }}
            />
            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setWeekAnchor(subWeeks(weekAnchor, 1))}
                className="rounded-xl border border-[#E6E8EF] bg-white px-4 py-2 text-sm font-medium"
              >
                Previous month
              </button>
              <button
                type="button"
                onClick={() => setWeekAnchor(addWeeks(weekAnchor, 1))}
                className="rounded-xl border border-[#E6E8EF] bg-white px-4 py-2 text-sm font-medium"
              >
                Next month
              </button>
            </div>
          </div>
        )}
      </div>

      <DayDetailList
        open={dayDetailOpen}
        onOpenChange={setDayDetailOpen}
        date={dayDetailDate}
        events={dayDetailEvents}
      />

      <Navigation />
    </div>
  )
}
