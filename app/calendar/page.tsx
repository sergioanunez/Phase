"use client"

import { useEffect, useState, useMemo } from "react"
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
import { SegmentedControl, type CalendarViewMode } from "@/components/calendar/segmented-control"
import { FilterChipsRow } from "@/components/calendar/filter-chips-row"
import { WeekHeaderCard } from "@/components/calendar/week-header-card"
import { DayCard } from "@/components/calendar/day-card"
import { MonthGrid } from "@/components/calendar/month-grid"
import { DayDetailList } from "@/components/calendar/day-detail-list"
import { HouseCalendarCard, type CalendarEventType } from "@/components/calendar/event-row"
import {
  formatDaySummary,
  formatWeekSummary,
  groupCalendarEventsByHouse,
  summarizeCalendarEvents,
  summarizeDayCalendarEvents,
} from "@/lib/calendar/group-events"

interface CalendarEvent {
  id: string
  date: string
  type: CalendarEventType
  title: string
  communityName?: string
  homeCount?: number
  homeId?: string
  homeLabel?: string
  contractorName?: string
  status?: "on_track" | "at_risk" | "behind" | "completed" | "overdue"
}

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]

/** Scheduled-work filters only — risk/priority lives in Flow Mode. */
const FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "work", label: "Work" },
  { id: "inspection", label: "Inspections" },
  { id: "punchlist", label: "Punch Items" },
  { id: "contractors", label: "Contractors" },
]

function matchesCalendarFilter(event: CalendarEvent, filterId: string | null): boolean {
  if (!filterId || filterId === "all") return true
  switch (filterId) {
    case "work":
      return event.type === "trade" || event.type === "milestone"
    case "inspection":
      return event.type === "inspection"
    case "punchlist":
      return event.type === "punchlist"
    case "contractors":
      return Boolean(event.contractorName?.trim())
    default:
      return event.type === filterId
  }
}

export default function CalendarPage() {
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
    return events.filter((e) => {
      // Deliveries hidden until PO module
      if (e.type === "delivery") return false
      return matchesCalendarFilter(e, filterChip)
    })
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
    const days: { date: Date; label: string; rows: ReturnType<typeof groupCalendarEventsByHouse> }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i)
      const key = format(d, "yyyy-MM-dd")
      const dayEventsForCard = eventsByDate[key] ?? []
      days.push({
        date: d,
        label: format(d, "EEE, MMM d"),
        rows: groupCalendarEventsByHouse(dayEventsForCard),
      })
    }
    return days
  }, [weekStart, eventsByDate])

  const todayKey = format(selectedDate, "yyyy-MM-dd")
  const dayEvents = eventsByDate[todayKey] ?? []
  const dayHouseRows = useMemo(
    () => groupCalendarEventsByHouse(dayEvents.filter((e) => e.status !== "completed")),
    [dayEvents]
  )
  const dayOverdue = useMemo(() => {
    const today = startOfDay(new Date())
    return filteredEvents.filter(
      (e) => parseISO(e.date) < today && e.status !== "completed"
    )
  }, [filteredEvents])
  const dayOverdueRows = useMemo(
    () => groupCalendarEventsByHouse(dayOverdue),
    [dayOverdue]
  )
  const dayUpcoming = useMemo(() => {
    const today = startOfDay(new Date())
    const nextWeek = addDays(today, 8)
    return filteredEvents.filter((e) => {
      const d = parseISO(e.date)
      return d > today && d < nextWeek
    })
  }, [filteredEvents])
  const dayUpcomingRows = useMemo(
    () => groupCalendarEventsByHouse(dayUpcoming.slice(0, 24)),
    [dayUpcoming]
  )

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
  const weekSummary = useMemo(
    () => formatWeekSummary(summarizeCalendarEvents(weekEvents)),
    [weekEvents]
  )
  const daySummary = useMemo(
    () => formatDaySummary(summarizeDayCalendarEvents(dayEvents)),
    [dayEvents]
  )

  const handleDayDetail = (date: Date) => {
    setDayDetailDate(date)
    setDayDetailOpen(true)
  }

  const dayDetailRows = useMemo(() => {
    if (!dayDetailOpen) return []
    const key = format(dayDetailDate, "yyyy-MM-dd")
    return groupCalendarEventsByHouse(eventsByDate[key] ?? [])
  }, [dayDetailOpen, dayDetailDate, eventsByDate])

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Where do you need to be — and what work is happening there?
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
            chips={FILTER_CHIPS}
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
              summary={weekSummary}
            />
            <div className="mt-4 space-y-4">
              {weekDayCards.map((day) => (
                <DayCard
                  key={day.label}
                  dayLabel={day.label}
                  rows={day.rows}
                  maxVisible={6}
                  viewAllCount={day.rows.length}
                  onViewAll={() => handleDayDetail(day.date)}
                />
              ))}
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
            <WeekHeaderCard
              dateRange={
                isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE, MMM d")
              }
              summary={daySummary}
            />
            <div className="mt-4 space-y-4">
              {dayOverdueRows.length > 0 && (
                <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-semibold text-foreground">Overdue</span>
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      {dayOverdue.length}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {dayOverdueRows.slice(0, 8).map((row) => (
                      <li key={row.id}>
                        <HouseCalendarCard row={row} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                <div className="mb-3 font-semibold text-foreground">Due Today</div>
                {dayHouseRows.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No houses due today</p>
                ) : (
                  <ul className="space-y-1">
                    {dayHouseRows.map((row) => (
                      <li key={row.id}>
                        <HouseCalendarCard row={row} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                <div className="mb-3 font-semibold text-foreground">Upcoming</div>
                {dayUpcomingRows.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No upcoming work</p>
                ) : (
                  <ul className="space-y-1">
                    {dayUpcomingRows.map((row) => (
                      <li key={row.id}>
                        <HouseCalendarCard row={row} />
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
        rows={dayDetailRows}
      />
    </div>
  )
}
