"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Settings } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Navigation } from "@/components/navigation"
import { PortfolioOverviewCard } from "@/components/dashboard/portfolio-overview-card"
import { BottleneckListCard } from "@/components/dashboard/bottleneck-list-card"
import { UpcomingInspectionsCard } from "@/components/dashboard/upcoming-inspections-card"
import { KPIGrid } from "@/components/dashboard/kpi-grid"
import { ActivityFeed } from "@/components/dashboard/activity-feed"

interface PortfolioData {
  activeHomesCount: number
  statusCounts: { notStarted: number; onTrack: number; atRisk: number; behind: number }
  bottlenecks: Array<{ key: string; label: string; count: number }>
  inspectionsUpcoming: Array<{ type: string; count: number }>
  kpis: Array<{ label: string; value: string; delta?: "up" | "down" | null }>
}

interface ActivityItem {
  id: string
  action: string
  actionType: string
  userName: string
  houseAddress: string
  subdivision: string
  taskName: string
  timestamp: string
  homeId?: string
  homeLabel?: string
}

type PhaseRow = {
  key: string
  name: string
  count: number
}

type PhaseDistribution = {
  phases: PhaseRow[]
  totalActiveHomes: number
  hasTemplate: boolean
}

type PulseHome = {
  homeId: string
  address: string
  notStarted: boolean
  lastCriticalTaskName: string | null
  lastCriticalCompletedAt: string | null
}

type PulseSubdivisionGroup = {
  subdivisionId: string
  subdivisionName: string
  homes: PulseHome[]
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "Admin"
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [phaseDistribution, setPhaseDistribution] = useState<PhaseDistribution | null>(null)
  const [pulseGroups, setPulseGroups] = useState<PulseSubdivisionGroup[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (session?.user === undefined) return
    if (!session?.user) {
      setPortfolioLoading(false)
      setActivitiesLoading(false)
      return
    }

    const fetchActivities = () => {
      fetch("/api/activity/recent", { credentials: "same-origin" })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setActivities(data)
          else setActivities([])
        })
        .catch(() => setActivities([]))
        .finally(() => setActivitiesLoading(false))
    }

    const loadDashboard = () => {
      setPortfolioLoading(true)
      setActivitiesLoading(true)
      Promise.all([
        fetch("/api/dashboard/portfolio", { credentials: "same-origin" })
          .then((res) => {
            if (!res.ok) return null
            return res.json()
          })
          .then((data) => {
            if (data && typeof data === "object" && data.error) return null
            return data ?? null
          })
          .catch((err) => {
            console.error("Dashboard portfolio:", err)
            return null
          }),
        fetch("/api/activity/recent", { credentials: "same-origin" })
          .then((res) => res.json())
          .then((data) => (Array.isArray(data) ? data : []))
          .catch(() => []),
        fetch("/api/dashboard/overview", { credentials: "same-origin" })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ])
        .then(([portfolioData, activitiesData, overviewData]) => {
          setPortfolio(portfolioData ?? null)
          setActivities(activitiesData ?? [])
          if (overviewData) {
            setPhaseDistribution(overviewData.phaseDistribution ?? null)
            setPulseGroups(overviewData.pulse ?? [])
          } else {
            setPhaseDistribution(null)
            setPulseGroups([])
          }
          setLastUpdated(new Date())
        })
        .finally(() => {
          setPortfolioLoading(false)
          setActivitiesLoading(false)
        })
    }

    loadDashboard()
    const interval = setInterval(fetchActivities, 5000)
    const minuteTicker = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => {
      clearInterval(interval)
      clearInterval(minuteTicker)
    }
  }, [session?.user])

  const portfolioFallback: PortfolioData = {
    activeHomesCount: 0,
    statusCounts: { notStarted: 0, onTrack: 0, atRisk: 0, behind: 0 },
    bottlenecks: [],
    inspectionsUpcoming: [],
    kpis: [
      { label: "% Homes on Track", value: "—", delta: null },
      { label: "Avg phase duration", value: "—", delta: null },
      { label: "Avg schedule variance", value: "—", delta: null },
      { label: "Starts vs Completions (MTD)", value: "—", delta: null },
    ],
  }
  const data = portfolio ?? portfolioFallback

  if (portfolioLoading && !portfolio) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 flex items-center justify-center">
        <div className="text-center text-muted-foreground">Loading dashboard…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Portfolio-level view of schedule health, bottlenecks, and live activity.
            {lastUpdated && (
              <span className="ml-1.5">
                Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}.
              </span>
            )}
          </p>
        </header>

        <div className="space-y-6">
          {/* 1) Portfolio Overview */}
          <PortfolioOverviewCard
            activeHomesCount={data.activeHomesCount}
            statusCounts={data.statusCounts}
          />

          {/* 2) Phase Distribution */}
          {phaseDistribution && (
            <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Phase Distribution</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Where active homes are stacked right now.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {phaseDistribution.totalActiveHomes} active homes
                </span>
              </div>
              {phaseDistribution.phases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {phaseDistribution.hasTemplate
                    ? "No active homes to display."
                    : "No work template yet. Create a Work Items Template to see phase distribution."}
                </p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxCount = Math.max(
                      1,
                      ...phaseDistribution.phases.map((p) => p.count)
                    )
                    return phaseDistribution.phases.map((phase) => {
                      const widthPct = (phase.count / maxCount) * 100
                      const barWidth = Math.max(8, widthPct)
                      return (
                        <button
                          key={phase.key}
                          type="button"
                          onClick={() => {
                            const url = new URL(window.location.origin + "/homes")
                            url.searchParams.set("phase", phase.key)
                            window.location.href = url.pathname + url.search
                          }}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">{phase.name}</span>
                            <span className="text-xs text-muted-foreground">{phase.count}</span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted">
                            <div
                              className="h-1.5 rounded-full bg-primary"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </button>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 3) Field Pulse */}
          {pulseGroups.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">Field Pulse</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Last milestone completed
              </p>
              <div className="mt-3 space-y-3">
                {pulseGroups.map((group) => (
                  <details
                    key={group.subdivisionId}
                    className="rounded-lg border border-muted bg-muted/40 p-3"
                    open
                  >
                    <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-foreground">
                      <span>{group.subdivisionName}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.homes.length} homes
                      </span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {group.homes.map((home) => (
                        <button
                          key={home.homeId}
                          type="button"
                          onClick={() => {
                            window.location.href = `/homes/${home.homeId}`
                          }}
                          className="w-full rounded-md bg-white px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">
                              {home.address}
                            </span>
                            {home.notStarted && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                Not started
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {home.lastCriticalTaskName ?? "—"}
                          </p>
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* 4) Bottlenecks */}
          <BottleneckListCard bottlenecks={data.bottlenecks} />

          {/* 5) Upcoming Inspections */}
          <UpcomingInspectionsCard inspectionsUpcoming={data.inspectionsUpcoming} />

          {/* 6) KPI Summary */}
          <KPIGrid kpis={data.kpis} />

          {/* 7) Live Activity Feed */}
          <ActivityFeed activities={activities} loading={activitiesLoading} />
        </div>
      </div>
      <Navigation />
    </div>
  )
}
