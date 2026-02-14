"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Settings } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { PortfolioOverviewCard } from "@/components/dashboard/portfolio-overview-card"
import { BottleneckListCard } from "@/components/dashboard/bottleneck-list-card"
import { UpcomingInspectionsCard } from "@/components/dashboard/upcoming-inspections-card"
import { KPIGrid } from "@/components/dashboard/kpi-grid"
import { ActivityFeed } from "@/components/dashboard/activity-feed"

interface PortfolioData {
  activeHomesCount: number
  statusCounts: { onTrack: number; atRisk: number; behind: number }
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

export default function DashboardPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "Admin"
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)

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
      ])
        .then(([portfolioData, activitiesData]) => {
          setPortfolio(portfolioData ?? null)
          setActivities(activitiesData ?? [])
        })
        .finally(() => {
          setPortfolioLoading(false)
          setActivitiesLoading(false)
        })
    }

    loadDashboard()
    const interval = setInterval(fetchActivities, 5000)
    return () => clearInterval(interval)
  }, [session?.user])

  const portfolioFallback: PortfolioData = {
    activeHomesCount: 0,
    statusCounts: { onTrack: 0, atRisk: 0, behind: 0 },
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
                aria-label="Settings / Admin"
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Portfolio-level view of schedule health, bottlenecks, and live activity. Drill down to Homes or Calendar as needed.
          </p>
        </header>

        <div className="space-y-6">
          {/* 1) Portfolio Overview */}
          <PortfolioOverviewCard
            activeHomesCount={data.activeHomesCount}
            statusCounts={data.statusCounts}
          />

          {/* 2) Bottlenecks */}
          <BottleneckListCard bottlenecks={data.bottlenecks} />

          {/* 3) Upcoming Inspections */}
          <UpcomingInspectionsCard inspectionsUpcoming={data.inspectionsUpcoming} />

          {/* 4) KPI Summary */}
          <KPIGrid kpis={data.kpis} />

          {/* 5) Live Activity Feed */}
          <ActivityFeed activities={activities} loading={activitiesLoading} />
        </div>
      </div>
      <Navigation />
    </div>
  )
}
