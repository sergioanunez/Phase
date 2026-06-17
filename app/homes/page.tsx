"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search } from "lucide-react"
import { TaskStatus } from "@prisma/client"
import { PlanViewer } from "@/components/plan-viewer"
import { CommunityAccordion } from "@/components/homes/community-accordion"
import { getScheduleStatus } from "@/lib/schedule-status"
import type { ScheduleStatus } from "@/lib/schedule-status"
import type { CommunityHome } from "@/components/homes/community-accordion"
import { compareHomesByDisplayOrder } from "@/lib/homes/display-order"
import {
  loadHomesListNavigationState,
  saveHomesListNavigationState,
} from "@/lib/homes/list-navigation-state"

interface Home {
  id: string
  addressOrLot: string
  displayOrder?: number
  startDate: string | null
  targetCompletionDate: string | null
  forecastCompletionDate: string | null
  forecastTotalWorkingDays: number | null
  criticalPathTaskIds?: string[]
  hasPlan?: boolean
  hasThumbnail?: boolean
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
    displayOrder: home.displayOrder,
    forecastCompletionDate: home.forecastCompletionDate,
    targetCompletionDate: home.targetCompletionDate,
    planName: home.planName,
    planVariant: home.planVariant,
    hasThumbnail: home.hasThumbnail,
    subdivision: home.subdivision ?? { id: "", name: "" },
    criticalPathTaskIds: home.criticalPathTaskIds ?? [],
    tasks: tasks.map((t) => ({
      id: t.id,
      status: t.status,
      scheduledDate: t.scheduledDate,
      nameSnapshot: t.nameSnapshot,
      contractor: t.contractor,
    })),
  }
}

type StatusFilter = "not_started" | "on_track" | "at_risk" | "behind"

export default function HomesPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const shouldRestore = searchParams.get("restore") === "1"
  const statusFilter = searchParams.get("status") as StatusFilter | null
  const reduceToStarter = searchParams.get("reduceToStarter") === "1"
  const reduceActiveHomes = searchParams.get("activeHomes")
  const reduceNeed = searchParams.get("needReduce")
  const [homes, setHomes] = useState<Home[]>([])
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [openSubdivisions, setOpenSubdivisions] = useState<string[]>([])
  const [planViewerHomeId, setPlanViewerHomeId] = useState<string | null>(null)
  const [planViewerOpen, setPlanViewerOpen] = useState(false)
  const restoredRef = useRef(false)
  const pendingScrollRef = useRef<ReturnType<typeof loadHomesListNavigationState>>(null)
  const planViewerHome = planViewerHomeId ? homes.find((h) => h.id === planViewerHomeId) : null

  useEffect(() => {
    Promise.all([
      fetch("/api/homes").then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          const message = typeof data.error === "string" ? data.error : "Failed to load homes"
          console.error("Homes API error:", data)
          setFetchError(message)
          return []
        }
        setFetchError(null)
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
    const validStatus = statusFilter && ["not_started", "on_track", "at_risk", "behind"].includes(statusFilter)
    const q = searchQuery.trim().toLowerCase()
    const scheduledCount = (home: Home) =>
      (home.tasks ?? []).filter((t) => t.scheduledDate != null).length
    return subdivisions.map((sub) => {
      const subHomes = groupedBySubdivision[sub.id] || []
      const withStatus = subHomes.map((home) => ({
        home: toCommunityHome(home),
        status: getScheduleStatus(
          home.forecastCompletionDate,
          home.targetCompletionDate,
          { startDate: home.startDate, scheduledTaskCount: scheduledCount(home) }
        ) as ScheduleStatus,
        progress: calculateProgress(home),
      }))
      const sorted = [...withStatus].sort((a, b) => {
        const orderCmp = compareHomesByDisplayOrder(
          { displayOrder: a.home.displayOrder, addressOrLot: a.home.addressOrLot },
          { displayOrder: b.home.displayOrder, addressOrLot: b.home.addressOrLot }
        )
        if (orderCmp !== 0) return orderCmp
        if (a.status === "not_started" && b.status !== "not_started") return -1
        if (a.status !== "not_started" && b.status === "not_started") return 1
        return 0
      })
      const filtered = validStatus
        ? sorted.filter((item) => item.status === statusFilter)
        : sorted
      const searchFiltered =
        q === ""
          ? filtered
          : filtered.filter(
              (item) =>
                item.home.addressOrLot.toLowerCase().includes(q) ||
                (item.home.subdivision?.name ?? "").toLowerCase().includes(q) ||
                (item.home.planName ?? "").toLowerCase().includes(q) ||
                (item.home.planVariant ?? "").toLowerCase().includes(q)
            )
      return { id: sub.id, name: sub.name, homes: searchFiltered }
    })
  }, [subdivisions, groupedBySubdivision, statusFilter, searchQuery])

  const visibleCommunities = useMemo(
    () => communities.filter((c) => c.homes.length > 0),
    [communities]
  )

  const handleHomeNavigate = useCallback(
    (homeId: string, subdivisionId: string) => {
      const open = openSubdivisions.includes(subdivisionId)
        ? openSubdivisions
        : [...openSubdivisions, subdivisionId]
      saveHomesListNavigationState({
        openSubdivisions: open,
        scrollY: window.scrollY,
        searchQuery,
        homeId,
      })
    },
    [openSubdivisions, searchQuery]
  )

  useEffect(() => {
    if (loading || restoredRef.current || !shouldRestore) return
    restoredRef.current = true
    const saved = loadHomesListNavigationState()
    if (!saved) {
      router.replace("/homes", { scroll: false })
      return
    }

    setSearchQuery(saved.searchQuery)
    setOpenSubdivisions(saved.openSubdivisions)
    pendingScrollRef.current = saved
  }, [loading, shouldRestore, router])

  useEffect(() => {
    const saved = pendingScrollRef.current
    if (!saved || loading) return

    const timer = window.setTimeout(() => {
      const el = saved.homeId
        ? document.getElementById(`home-card-${saved.homeId}`)
        : null
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "auto" })
      } else if (saved.scrollY > 0) {
        window.scrollTo({ top: saved.scrollY, behavior: "auto" })
      }
      pendingScrollRef.current = null
      router.replace("/homes", { scroll: false })
    }, 200)

    return () => window.clearTimeout(timer)
  }, [loading, openSubdivisions, searchQuery, visibleCommunities.length, router])

  const filterLabel =
    statusFilter === "not_started"
      ? "Not started"
      : statusFilter === "on_track"
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
            ) : fetchError ? (
              <>
                <p className="text-lg text-muted-foreground mb-2">
                  Could not load homes
                </p>
                <p className="text-sm text-muted-foreground max-w-md">
                  {fetchError}
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
            communities={visibleCommunities}
            openSubdivisions={openSubdivisions}
            onOpenSubdivisionsChange={setOpenSubdivisions}
            onHomeNavigate={handleHomeNavigate}
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
    </div>
  )
}
