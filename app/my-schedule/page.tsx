"use client"

import { useEffect, useState, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
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
import { ChevronLeft, Bell } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { SegmentedControl, type CalendarViewMode } from "@/components/calendar/segmented-control"
import { WeekHeader } from "@/components/contractor-schedule/week-header"
import { ContractorDayCard } from "@/components/contractor-schedule/day-card"
import { JobRow } from "@/components/contractor-schedule/job-row"
import { JobDetailSheet } from "@/components/contractor-schedule/job-detail-sheet"
import { MonthGrid } from "@/components/calendar/month-grid"
import type { ContractorScheduleEvent } from "@/components/contractor-schedule/job-row"

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]

interface ScheduleResponse {
  events: ContractorScheduleEvent[]
  contractorCompanyName: string | null
}

export default function MySchedulePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week")
  const [weekAnchor, setWeekAnchor] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [events, setEvents] = useState<ContractorScheduleEvent[]>([])
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [jobDetailOpen, setJobDetailOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<ContractorScheduleEvent | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
      return
    }
    if (session?.user?.role !== "Subcontractor") {
      router.push("/")
      return
    }
  }, [session?.user?.role, status, router])

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn: 1 }),
    [weekAnchor]
  )
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, { weekStartsOn: 1 }),
    [weekAnchor]
  )
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
    if (session?.user?.role !== "Subcontractor") return
    const params = new URLSearchParams({
      start: fetchStart.toISOString(),
      end: fetchEnd.toISOString(),
    })
    fetch(`/api/subcontractor/schedule?${params}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: ScheduleResponse & { error?: string }) => {
        if (data.error) throw new Error(data.error)
        setEvents(Array.isArray(data.events) ? data.events : [])
        setCompanyName(data.contractorCompanyName ?? null)
      })
      .catch(() => {
        setEvents([])
        setCompanyName(null)
      })
      .finally(() => setLoading(false))
  }, [session?.user?.role, fetchStart.toISOString(), fetchEnd.toISOString()])

  const eventsByDate = useMemo(() => {
    const map: Record<string, ContractorScheduleEvent[]> = {}
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    })
    return map
  }, [events])

  const weekDayCards = useMemo(() => {
    const days: { date: Date; label: string; events: ContractorScheduleEvent[] }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i)
      const key = format(d, "yyyy-MM-dd")
      days.push({
        date: d,
        label: format(d, "EEE MMM d"),
        events: eventsByDate[key] ?? [],
      })
    }
    return days
  }, [weekStart, eventsByDate])

  const todayKey = format(selectedDate, "yyyy-MM-dd")
  const dayEvents = eventsByDate[todayKey] ?? []
  const dayOverdue = useMemo(() => {
    const today = startOfDay(new Date())
    return events.filter((e) => new Date(e.date) < today && e.status !== "completed")
  }, [events])
  const dayUpcoming = useMemo(() => {
    const today = startOfDay(new Date())
    const nextWeek = addDays(today, 8)
    return events.filter((e) => {
      const d = new Date(e.date)
      return d >= today && d < nextWeek
    })
  }, [events])

  const eventsCountForMonth = useMemo(() => {
    const map: Record<string, number> = {}
    events.forEach((e) => {
      map[e.date] = (map[e.date] ?? 0) + 1
    })
    return map
  }, [events])

  const handleJobClick = (event: ContractorScheduleEvent) => {
    setSelectedEvent(event)
    setJobDetailOpen(true)
  }

  const handleJobComplete = (eventId: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, status: "completed" as const } : e))
    )
    setSelectedEvent((prev) =>
      prev?.id === eventId ? { ...prev, status: "completed" as const } : prev ?? null
    )
  }

  const handleMonthDaySelect = (date: Date) => {
    setWeekAnchor(startOfWeek(date, { weekStartsOn: 1 }))
    setViewMode("week")
  }

  if (status === "loading" || (status === "authenticated" && session?.user?.role !== "Subcontractor")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9]">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        {/* Top app bar */}
        <header className="mb-4 flex items-center justify-between">
          <Link
            href="/my-schedule"
            className="text-lg font-semibold text-foreground"
          >
            Phase
          </Link>
          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground hover:bg-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
        </header>

        <div className="mb-4 flex justify-center">
          <SegmentedControl
            value={viewMode}
            onChange={(mode) => {
              setViewMode(mode)
              if (mode === "day") setSelectedDate(new Date())
            }}
            options={VIEW_OPTIONS}
          />
        </div>

        {viewMode === "week" && (
          <WeekHeader
            weekRange={`${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d")}`}
            onPrev={() => setWeekAnchor(subWeeks(weekAnchor, 1))}
            onNext={() => setWeekAnchor(addWeeks(weekAnchor, 1))}
          />
        )}

        {viewMode === "month" && (
          <div className="mb-4 flex justify-between">
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
        )}

        {/* Contractor identity */}
        {companyName && (
          <div className="mt-4">
            <span className="inline-flex items-center rounded-full border border-[#E6E8EF] bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm">
              {companyName}
            </span>
          </div>
        )}

        <p className="mt-2 text-sm text-muted-foreground">
          Tap any job for more details.
        </p>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : viewMode === "week" ? (
          <div className="mt-4 space-y-4">
            {weekDayCards.map((day) => (
              <ContractorDayCard
                key={day.label}
                dayLabel={day.label}
                events={day.events}
                onJobClick={handleJobClick}
              />
            ))}
          </div>
        ) : viewMode === "day" ? (
          <div className="mt-4 space-y-4">
            {dayOverdue.length > 0 && (
              <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                <h3 className="mb-3 font-semibold text-foreground">Overdue</h3>
                <ul className="space-y-1">
                  {dayOverdue.map((e) => (
                    <li key={e.id}>
                      <JobRow event={e} onClick={() => handleJobClick(e)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-semibold text-foreground">
                {isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE")} –{" "}
                {format(selectedDate, "MMM d")}
              </h3>
              {dayEvents.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No jobs this day</p>
              ) : (
                <ul className="space-y-1">
                  {dayEvents.map((e) => (
                    <li key={e.id}>
                      <JobRow event={e} onClick={() => handleJobClick(e)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {dayUpcoming.length > 0 && (
              <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
                <h3 className="mb-3 font-semibold text-foreground">Upcoming</h3>
                <ul className="space-y-1">
                  {dayUpcoming.slice(0, 6).map((e) => (
                    <li key={e.id}>
                      <JobRow event={e} onClick={() => handleJobClick(e)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <MonthGrid
              current={weekAnchor}
              eventsByDate={eventsCountForMonth}
              onSelectDay={handleMonthDaySelect}
            />
          </div>
        )}

        {events.length === 0 && !loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No jobs scheduled for this period
          </div>
        )}
      </div>

      <JobDetailSheet
        open={jobDetailOpen}
        onOpenChange={setJobDetailOpen}
        event={selectedEvent}
      />

      <Navigation />
    </div>
  )
}
