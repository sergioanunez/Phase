"use client"

import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { TaskStatus } from "@prisma/client"
import { PlanViewer } from "@/components/plan-viewer"
import { CommunityAccordion } from "@/components/homes/community-accordion"
import { getScheduleStatus } from "@/lib/schedule-status"
import type { ScheduleStatus } from "@/lib/schedule-status"
import type { CommunityHome } from "@/components/homes/community-accordion"

interface Home {
  id: string
  addressOrLot: string
  startDate: string | null
  targetCompletionDate: string | null
  forecastCompletionDate: string | null
  forecastTotalWorkingDays: number | null
  hasPlan?: boolean
  planName?: string | null
  planVariant?: string | null
  planUploadedAt?: string | null
  subdivision: {
    id: string
    name: string
  }
  tasks: Array<{
    id: string
    status: TaskStatus
    scheduledDate: string | null
    completedAt: string | null
    nameSnapshot: string
    contractor: {
      id: string
      companyName: string
    } | null
  }>
}

interface Subdivision {
  id: string
  name: string
  homes: Array<{ id: string }>
}

function calculateProgress(home: Home): number {
  const tasks = home.tasks ?? []
  const total = tasks.length
  const canceled = tasks.filter((t) => t.status === "Canceled").length
  const completed = tasks.filter((t) => t.status === "Completed").length
  return total - canceled > 0
    ? Math.round((completed / (total - canceled)) * 100)
    : 0
}

function toCommunityHome(home: Home): CommunityHome {
  const tasks = home.tasks ?? []
  return {
    id: home.id,
    addressOrLot: home.addressOrLot,
    forecastCompletionDate: home.forecastCompletionDate,
    targetCompletionDate: home.targetCompletionDate,
    subdivision: home.subdivision ?? { id: "", name: "" },
    tasks: tasks.map((t) => ({
      id: t.id,
      scheduledDate: t.scheduledDate,
      nameSnapshot: t.nameSnapshot,
      contractor: t.contractor,
    })),
  }
}

type StatusFilter = "on_track" | "at_risk" | "behind"

export default function HomesPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get("status") as StatusFilter | null
  const reduceToStarter = searchParams.get("reduceToStarter") === "1"
  const reduceActiveHomes = searchParams.get("activeHomes")
  const reduceNeed = searchParams.get("needReduce")
  const [homes, setHomes] = useState<Home[]>([])
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [planViewerHomeId, setPlanViewerHomeId] = useState<string | null>(null)
  const [planViewerOpen, setPlanViewerOpen] = useState(false)
  const planViewerHome = planViewerHomeId ? homes.find((h) => h.id === planViewerHomeId) : null

  useEffect(() => {
    Promise.all([
      fetch("/api/homes").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Homes API error:", data)
          return []
        }
        return Array.isArray(data) ? data : []
      }),
      fetch("/api/subdivisions").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          console.error("Subdivisions API error:", data)
          return []
        }
        return Array.isArray(data) ? data : []
      }),
    ])
      .then(([homesData, subdivisionsData]) => {
        setHomes(homesData)
        setSubdivisions(subdivisionsData)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Fetch error:", err)
        setHomes([])
        setSubdivisions([])
        setLoading(false)
      })
  }, [])

  const groupedBySubdivision = useMemo(
    () =>
      Array.isArray(homes)
        ? homes.reduce((acc, home) => {
            const key = home.subdivision?.id ?? ""
            if (!key) return acc
            if (!acc[key]) acc[key] = []
            acc[key].push(home)
            return acc
          }, {} as Record<string, Home[]>)
        : {},
    [homes]
  )

  const communities = useMemo(() => {
    const validStatus = statusFilter && ["on_track", "at_risk", "behind"].includes(statusFilter)
    const q = searchQuery.trim().toLowerCase()
    return subdivisions.map((sub) => {
      const subHomes = groupedBySubdivision[sub.id] || []
      const withStatus = subHomes.map((home) => ({
        home: toCommunityHome(home),
        status: getScheduleStatus(
          home.forecastCompletionDate,
          home.targetCompletionDate
        ) as ScheduleStatus,
        progress: calculateProgress(home),
      }))
      const filtered = validStatus
        ? withStatus.filter((item) => item.status === statusFilter)
        : withStatus
      const searchFiltered =
        q === ""
          ? filtered
          : filtered.filter(
              (item) =>
                item.home.addressOrLot.toLowerCase().includes(q) ||
                (item.home.subdivision?.name ?? "").toLowerCase().includes(q)
            )
      return { id: sub.id, name: sub.name, homes: searchFiltered }
    })
  }, [subdivisions, groupedBySubdivision, statusFilter, searchQuery])

  const filterLabel =
    statusFilter === "on_track"
      ? "On Track"
      : statusFilter === "at_risk"
        ? "At Risk"
        : statusFilter === "behind"
          ? "Behind"
          : null

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        {/* Page title area */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Homes</h1>
            {filterLabel && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm text-muted-foreground">
                  Filter: {filterLabel}
                </span>
                <Link
                  href="/homes"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Clear filter
                </Link>
              </>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Browse and manage homes by community. View schedule status, progress, and open tasks.
          </p>
          <div className="relative mt-4 w-full">
            <Search
              className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground opacity-90 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search by address or community"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-[50px] rounded-lg border border-border bg-white py-3 pl-11 pr-4 text-base shadow-sm placeholder:text-muted-foreground transition-[box-shadow,border-color] focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary"
              aria-label="Search homes by address or community"
            />
          </div>
        </div>

        {reduceToStarter && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Reduce to Starter</p>
            <p className="mt-1">
              Archive or complete homes until you have at most <strong>5 active homes</strong> to
              use the Starter plan.
            </p>
            {(reduceActiveHomes || reduceNeed) && (
              <p className="mt-1 text-xs text-amber-900/90">
                {reduceActiveHomes && (
                  <>
                    You currently have <strong>{reduceActiveHomes}</strong> active homes.
                    {" "}
                  </>
                )}
                {reduceNeed && (
                  <>
                    You need to reduce by <strong>{reduceNeed}</strong> home
                    {reduceNeed === "1" ? "" : "s"}.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {communities.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E6E8EF] bg-white py-12 text-center shadow-sm">
            <p className="text-lg text-muted-foreground mb-2">
              No subdivisions have been created yet
            </p>
            <p className="text-sm text-muted-foreground">
              Subdivisions will appear here once they are created in Settings
            </p>
          </div>
        ) : communities.filter((c) => c.homes.length > 0).length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E6E8EF] bg-white py-12 text-center shadow-sm">
            {searchQuery.trim() ? (
              <>
                <p className="text-lg text-muted-foreground mb-2">
                  No homes match your search
                </p>
                <p className="text-sm text-muted-foreground">
                  Try a different address or community name, or clear the search bar above.
                </p>
              </>
            ) : filterLabel ? (
              <>
                <p className="text-lg text-muted-foreground mb-2">
                  No homes match this filter
                </p>
                <p className="text-sm text-muted-foreground">
                  No homes are {filterLabel.toLowerCase()}.{" "}
                  <Link href="/homes" className="text-primary underline-offset-2 hover:underline">
                    View all homes
                  </Link>
                </p>
              </>
            ) : session?.user?.role === "Superintendent" ? (
              <>
                <p className="text-lg text-muted-foreground mb-2">
                  No homes assigned to you yet
                </p>
                <p className="text-sm text-muted-foreground">
                  An admin can assign you to homes in Settings. Once assigned, they will appear here.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg text-muted-foreground mb-2">
                  No homes to show
                </p>
                <p className="text-sm text-muted-foreground">
                  Homes will appear here once they are created and assigned in Settings.
                </p>
              </>
            )}
          </div>
        ) : (
          <CommunityAccordion
            communities={communities.filter((c) => c.homes.length > 0)}
          />
        )}
      </div>

      {planViewerHome && (
        <PlanViewer
          homeId={planViewerHome.id}
          addressOrLot={planViewerHome.addressOrLot}
          planName={planViewerHome.planName}
          planVariant={planViewerHome.planVariant}
          open={planViewerOpen}
          onOpenChange={(open) => {
            setPlanViewerOpen(open)
            if (!open) setPlanViewerHomeId(null)
          }}
        />
      )}
      <Navigation />
    </div>
  )
}
