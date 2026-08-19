"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Settings } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { WelcomeBanner } from "@/components/onboarding/welcome-banner"
import { PortfolioOverviewCard } from "@/components/dashboard/portfolio-overview-card"
import { BottleneckListCard } from "@/components/dashboard/bottleneck-list-card"
import { UpcomingInspectionsCard } from "@/components/dashboard/upcoming-inspections-card"
import { KPIGrid } from "@/components/dashboard/kpi-grid"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { DashboardHouseDrilldown } from "@/components/dashboard/dashboard-house-drilldown"
import {
  PORTFOLIO_STATUS_TITLES,
  canOpenDrilldown,
  parseInspectParam,
  serializeInspectParam,
  type DashboardDrilldownContext,
  type DashboardHouseRowData,
} from "@/lib/dashboard/drilldown"
import type { ScheduleStatus } from "@/lib/schedule-status"

interface PortfolioData {
  activeHomesCount: number
  statusCounts: { notStarted: number; onTrack: number; atRisk: number; behind: number }
  homesByStatus?: Record<ScheduleStatus, DashboardHouseRowData[]>
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
  lastCriticalTaskId?: string | null
  lastCriticalTaskName: string | null
  lastCriticalCompletedAt: string | null
  nextCriticalTaskId?: string | null
  nextCriticalTaskName?: string | null
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

function pulseHomesToRows(
  group: PulseSubdivisionGroup
): DashboardHouseRowData[] {
  return group.homes.map((home, index) => ({
    homeId: home.homeId,
    address: home.address,
    subdivisionName: group.subdivisionName,
    startDate: null,
    forecastDate: null,
    targetDate: null,
    daysBehind: null,
    nextCriticalTaskId: home.nextCriticalTaskId ?? null,
    nextCriticalTaskName: home.nextCriticalTaskName ?? null,
    lastMilestoneTaskId: home.lastCriticalTaskId ?? null,
    lastMilestoneName: home.lastCriticalTaskName,
    lastMilestoneCompletedAt: home.lastCriticalCompletedAt,
    displayOrder: index,
  }))
}

function PhaseDistributionCard({
  phaseDistribution,
  onPhaseSelect,
}: {
  phaseDistribution: PhaseDistribution
  onPhaseSelect?: (phase: PhaseRow) => void
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
    <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm overflow-hidden">
      <div className="mb-3 flex min-w-0 items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Construction Timeline
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Where homes are in the build process
          </p>
        </div>
        <div className="max-w-[40%] shrink-0">
          <span className="block text-right text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
            Days to completion
          </span>
        </div>
      </div>
      {phases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="space-y-3.5 min-w-0">
          {phases.map((phase, rowIndex) => {
            const barWidthPercent = (phase.count / maxCount) * 100
            const fillColor = getPhaseColorByIndex(rowIndex)
            const countLabel =
              phase.count === 1 ? "1 home" : `${phase.count} homes`
            const metricStr =
              phase.avgRemainingDays != null
                ? `${phase.avgRemainingDays}d`
                : "—"
            return (
              <button
                key={phase.key}
                type="button"
                aria-label={`View ${phase.count} homes in ${phase.name}`}
                onClick={() => onPhaseSelect?.(phase)}
                className="w-full min-w-0 text-left"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground">
                      {phase.name}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {countLabel}
                    </div>
                  </div>
                  <span className="w-[60px] shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted-foreground">
                    {metricStr}
                  </span>
                </div>
                <div className="phase-rail mt-1.5 h-2 w-full min-w-0 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="phase-fill h-2 max-w-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: animate ? `${Math.max(8, barWidthPercent)}%` : "0%",
                      backgroundColor: fillColor,
                      transitionDelay: animate ? `${rowIndex * 80}ms` : "0ms",
                    }}
                  />
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAdmin = session?.user?.role === "Admin"
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)
  const showTourParam = searchParams.get("tour") === "onboarding"
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [phaseDistribution, setPhaseDistribution] = useState<PhaseDistribution | null>(null)
  const [pulseGroups, setPulseGroups] = useState<PulseSubdivisionGroup[]>([])
  const [homesByPhase, setHomesByPhase] = useState<Record<string, DashboardHouseRowData[]>>({})
  const [drilldown, setDrilldown] = useState<DashboardDrilldownContext | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [, setTick] = useState(0)
  const [freshnessLabel, setFreshnessLabel] = useState<"just_now" | "lt_min" | null>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem("phase-dashboard-scroll")
    if (saved) window.scrollTo(0, Number(saved) || 0)
    const onScroll = () => {
      sessionStorage.setItem("phase-dashboard-scroll", String(window.scrollY))
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

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
            setHomesByPhase(overviewData.homesByPhase ?? {})
          } else {
            setPhaseDistribution(null)
            setPulseGroups([])
            setHomesByPhase({})
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
    if (isAdmin || session?.user?.role === "Manager") {
      fetch("/api/onboarding", { credentials: "same-origin" })
        .then((res) => res.json())
        .then((data) => setOnboardingCompleted(data.onboardingCompleted ?? true))
        .catch(() => setOnboardingCompleted(true))
    } else {
      setOnboardingCompleted(true)
    }
    const interval = setInterval(fetchActivities, 5000)
    const minuteTicker = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => {
      clearInterval(interval)
      clearInterval(minuteTicker)
    }
  }, [session?.user, isAdmin])

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
    homesByStatus: {
      not_started: [],
      on_track: [],
      at_risk: [],
      behind: [],
    },
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

  const emptyHomesByStatus: Record<ScheduleStatus, DashboardHouseRowData[]> = {
    not_started: [],
    on_track: [],
    at_risk: [],
    behind: [],
  }

  const openDrilldown = (ctx: DashboardDrilldownContext, count: number) => {
    if (!canOpenDrilldown(count)) return
    setDrilldown(ctx)
    const params = new URLSearchParams(searchParams.toString())
    params.set("inspect", serializeInspectParam(ctx))
    router.replace(`/dashboard?${params.toString()}`, { scroll: false })
  }

  const closeDrilldown = () => {
    setDrilldown(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("inspect")
    const qs = params.toString()
    router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false })
  }

  const homesByStatus = data.homesByStatus ?? emptyHomesByStatus

  useEffect(() => {
    const parsed = parseInspectParam(searchParams.get("inspect"))
    if (!parsed) {
      setDrilldown(null)
      return
    }
    if (parsed.kind === "portfolio") {
      const status = parsed.key as ScheduleStatus
      setDrilldown({
        kind: "portfolio",
        status,
        title: PORTFOLIO_STATUS_TITLES[status],
      })
      return
    }
    if (parsed.kind === "timeline") {
      const phase = phaseDistribution?.phases.find((p) => p.key === parsed.key)
      setDrilldown({
        kind: "timeline",
        phaseKey: parsed.key,
        title: phase?.name ?? parsed.key.replace(/^category:/, ""),
      })
      return
    }
    const group = pulseGroups.find((g) => g.subdivisionId === parsed.key)
    setDrilldown({
      kind: "pulse",
      subdivisionId: parsed.key,
      title: group?.subdivisionName ?? "Field Pulse",
    })
  }, [searchParams, phaseDistribution, pulseGroups])

  const drilldownHouses: DashboardHouseRowData[] = (() => {
    if (!drilldown) return []
    if (drilldown.kind === "portfolio") return homesByStatus[drilldown.status] ?? []
    if (drilldown.kind === "timeline") return homesByPhase[drilldown.phaseKey] ?? []
    const group = pulseGroups.find((g) => g.subdivisionId === drilldown.subdivisionId)
    return group ? pulseHomesToRows(group) : []
  })()

  if (portfolioLoading && !portfolio) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 flex items-center justify-center">
        <div className="text-center text-muted-foreground">Loading dashboard…</div>
      </div>
    )
  }

  const showWelcomeBanner =
    onboardingCompleted === false && !showTourParam && (isAdmin || session?.user?.role === "Manager")

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4" data-onboarding="dashboard">
        {/* Welcome banner (non-blocking) */}
        {showWelcomeBanner && (
          <div className="mb-6">
            <WelcomeBanner
              onStartTour={() => router.push("/dashboard?tour=onboarding")}
              onSkip={async () => {
                try {
                  await fetch("/api/onboarding", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ onboardingCompleted: true }),
                  })
                  setOnboardingCompleted(true)
                } catch {
                  setOnboardingCompleted(true)
                }
              }}
            />
          </div>
        )}

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
            onStatusSelect={(status, count) =>
              openDrilldown(
                { kind: "portfolio", status, title: PORTFOLIO_STATUS_TITLES[status] },
                count
              )
            }
          />

          {/* 2) Phase Distribution */}
          {phaseDistribution && (
            <PhaseDistributionCard
              phaseDistribution={phaseDistribution}
              onPhaseSelect={(phase) =>
                openDrilldown(
                  { kind: "timeline", phaseKey: phase.key, title: phase.name },
                  phase.count
                )
              }
            />
          )}

          {/* 3) Field Pulse */}
          {pulseGroups.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">Field Pulse</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Last milestone completed
              </p>
              <div className="mt-3 space-y-2">
                {pulseGroups.map((group) => (
                  <button
                    key={group.subdivisionId}
                    type="button"
                    aria-label={`View ${group.homes.length} homes in ${group.subdivisionName} Field Pulse`}
                    onClick={() =>
                      openDrilldown(
                        {
                          kind: "pulse",
                          subdivisionId: group.subdivisionId,
                          title: group.subdivisionName,
                        },
                        group.homes.length
                      )
                    }
                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-muted bg-muted/40 px-3 py-3 text-left hover:bg-muted/70"
                  >
                    <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                      {group.subdivisionName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {group.homes.length} homes
                    </span>
                  </button>
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

      <DashboardHouseDrilldown
        open={drilldown != null}
        onOpenChange={(next) => {
          if (!next) closeDrilldown()
        }}
        title={drilldown?.title ?? ""}
        kind={drilldown?.kind ?? "portfolio"}
        houses={drilldownHouses}
      />
    </div>
  )
}
