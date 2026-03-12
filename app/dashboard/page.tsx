"use client"

import { useEffect, useState, useRef } from "react"
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
  avgRemainingDays: number | null
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

const PHASE_GRADIENT_COLORS = [
  "#E6EEF8",
  "#D3E2F3",
  "#B6D0E9",
  "#8FB5DB",
  "#5E95C9",
  "#2F6FAF",
]

function getPhaseColorByIndex(index: number): string {
  return PHASE_GRADIENT_COLORS[Math.min(index, PHASE_GRADIENT_COLORS.length - 1)]
}

function PhaseDistributionCard({
  phaseDistribution,
}: {
  phaseDistribution: PhaseDistribution
}) {
  const [animate, setAnimate] = useState(false)
  const hasAnimated = useRef(false)
  useEffect(() => {
    if (hasAnimated.current) return
    hasAnimated.current = true
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) {
      setAnimate(true)
      return
    }
    const t = setTimeout(() => setAnimate(true), 50)
    return () => clearTimeout(t)
  }, [])

  const { phases, totalActiveHomes, hasTemplate } = phaseDistribution
  const maxCount = Math.max(1, ...phases.map((p) => p.count))

  const emptyMessage =
    totalActiveHomes === 0
      ? "No active homes yet."
      : !hasTemplate
        ? "No work template yet. Create a Work Items Template to see phase distribution."
        : "No active homes to display."

  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Construction Timeline
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Where homes are in the build process
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs font-medium text-muted-foreground text-right">
            Days to completion (working days)
          </span>
        </div>
      </div>
      {phases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {phases.map((phase, rowIndex) => {
            const barWidthPercent = (phase.count / maxCount) * 100
            const fillColor = getPhaseColorByIndex(rowIndex)
            const countLabel =
              phase.count === 1 ? "1 home" : `${phase.count} homes`
            const metricStr =
              phase.avgRemainingDays != null
                ? `${phase.avgRemainingDays} days`
                : "—"
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
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="min-w-0 shrink-0 sm:w-40">
                    <div className="font-medium text-foreground">
                      {phase.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {countLabel}
                    </div>
                  </div>
                  <div className="phase-rail h-2 min-w-0 flex-1 rounded-full bg-gray-100">
                    <div
                      className="phase-fill h-2 rounded-full transition-[width] duration-[600ms] ease-out"
                      style={{
                        width: animate ? `${Math.max(8, barWidthPercent)}%` : "0%",
                        backgroundColor: fillColor,
                        transitionDelay: animate ? `${rowIndex * 80}ms` : "0ms",
                      }}
                    />
                  </div>
                  <span
                    className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground"
                  >
                    {metricStr}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
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
  const [freshnessLabel, setFreshnessLabel] = useState<"just_now" | "lt_min" | null>(null)

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
          const now = new Date()
          setLastUpdated(now)
          setFreshnessLabel("just_now")
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

  useEffect(() => {
    if (!lastUpdated || !freshnessLabel) return

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const delay = freshnessLabel === "just_now" ? (reduceMotion ? 5000 : 12000) : 0
    if (!delay) return

    const t = setTimeout(() => {
      setFreshnessLabel("lt_min")
    }, delay)
    return () => clearTimeout(t)
  }, [lastUpdated, freshnessLabel])

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
          </p>
          {lastUpdated && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              {freshnessLabel === "just_now" && "Updated just now"}
              {freshnessLabel === "lt_min" && "Updated less than a minute ago"}
              {!freshnessLabel &&
                `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}`}
            </p>
          )}
        </header>

        <div className="space-y-6">
          {/* 1) Portfolio Overview */}
          <PortfolioOverviewCard
            activeHomesCount={data.activeHomesCount}
            statusCounts={data.statusCounts}
          />

          {/* 2) Phase Distribution */}
          {phaseDistribution && (
            <PhaseDistributionCard phaseDistribution={phaseDistribution} />
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
