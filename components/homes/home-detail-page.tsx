"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { TaskModal } from "@/components/task-modal"
import { PunchItemsList } from "@/components/punch-items-list"
import { TaskStatus } from "@prisma/client"
import { format, isBefore, isAfter, startOfDay } from "date-fns"
import { normalizeStoredScheduledDate } from "@/lib/calendar-date"
import { ScheduleTimeline } from "@/components/schedule-timeline"
import { ProgressBar } from "@/components/homes/progress-bar"
import { getScheduleStatus as getBarScheduleStatus } from "@/lib/schedule-status"
import { ClipboardList, Lock, FileText, Upload, Check, ChevronRight, Mail, MapPin, Ban } from "lucide-react"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { buildWorkItemWhatsAppText, openWhatsAppShare, openEmailShare } from "@/lib/share/whatsapp"
import { PlanViewer } from "@/components/plan-viewer"
import { ImageViewer } from "@/components/image-viewer"
import { HomeActivityTimeline } from "@/components/home-activity-timeline"
import { HomeRescheduleHistory } from "@/components/home-reschedule-history"
import { HouseScheduleCard } from "@/components/homes/house-schedule-card"
import { GenerateScheduleCard } from "@/components/homes/generate-schedule-card"
import {
  HouseDetailStickyAddress,
  useHouseHeaderInView,
} from "@/components/homes/house-detail-sticky-address"
import type { TaskRescheduleReason } from "@prisma/client"
import { cn } from "@/lib/utils"
import { StatusPill, type ScheduleStatus } from "@/components/homes/status-pill"
import Link from "next/link"
import { homesListRestoreHref } from "@/lib/homes/list-navigation-state"
import { groupPlansByTag, type ListedHomePlan } from "@/lib/home-plans"
import { isExcludedFromProgress, badgeLabelForTaskStatus } from "@/lib/task-status"
import { labelForNotApplicableReason } from "@/lib/not-applicable-reason-labels"
import { MarkNotApplicableDialog } from "@/components/mark-not-applicable-dialog"
import { CatchUpScheduleDialog } from "@/components/catch-up-schedule-dialog"
import { WorkItemMetadata } from "@/components/work-item-metadata"
import { playTaskComplete } from "@/lib/feedback"
import type { TaskNotApplicableReason } from "@prisma/client"
import {
  applyForecastReconcileToHome,
  mergeHomeTask,
  patchHomeTask,
} from "@/lib/homes/patch-home-task"
import {
  FORECAST_RECONCILE_DEBOUNCE_MS,
  mutationForecastAlreadyPersisted,
  mutationNeedsGateRefresh,
  type TaskMutationClientResult,
  type TaskMutationKind,
} from "@/lib/homes/mutation-reconcile"
import { beginMutationPerf, type MutationPerfSession } from "@/lib/homes/mutation-perf"

interface HomeTask {
  id: string
  nameSnapshot: string
  status: TaskStatus
  scheduledDate: string | null
  completedAt: string | null
  /** Confirmation SMS / call time — “Called” on work item cards. */
  lastConfirmationAt?: string | null
  startedAt?: string | null
  /** Populated when status is Confirmed (manual vs SMS). */
  confirmationSource?: "Manual" | "Sms" | null
  contractorId: string | null
  contractor: {
    id: string
    companyName: string
  } | null
  notes: string | null
  hasOpenPunch: boolean
  punchOpenCount: number
  sortOrderSnapshot: number
  durationDaysSnapshot: number
  forecastEarlyStartOffsetWorkingDays?: number | null
  forecastEarlyFinishOffsetWorkingDays?: number | null
  isCriticalPath?: boolean
  templateItem: {
    id: string
    name: string
    optionalCategory: string | null
    isCriticalGate?: boolean
    gateName?: string | null
  }
  schedulingBlockedReason?: string | null
  lastRescheduleReason?: TaskRescheduleReason | null
  lastRescheduleNote?: string | null
  lastRescheduledAt?: string | null
  lastPreviousScheduledDate?: string | null
  rescheduleCount?: number
  lastRescheduledBy?: { id: string; name: string | null } | null
  reportedCompleteAt?: string | null
  reportedCompleteNote?: string | null
  reportedCompleteBy?: { id: string; name: string | null } | null
  notApplicableReason?: TaskNotApplicableReason | null
  notApplicableNote?: string | null
  notApplicableAt?: string | null
  notApplicableBy?: { id: string; name: string | null } | null
}

interface Home {
  id: string
  addressOrLot: string
  subdivision?: {
    id: string
    name: string
  } | null
  startDate: string | null
  targetCompletionDate?: string | null
  forecastCompletionDate?: string | null
  forecastTotalWorkingDays?: number | null
  forecastComputedAt?: string | null
  hasPlan?: boolean
  hasThumbnail?: boolean
  planName?: string | null
  planVariant?: string | null
  planStoragePath?: string | null
  planUploadedAt?: string | null
  tasks: HomeTask[]
}

export function HomeDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const [home, setHome] = useState<Home | null>(null)
  const [loading, setLoading] = useState(true)
  const [homeError, setHomeError] = useState<"not_found" | "forbidden" | null>(null)
  const [selectedTask, setSelectedTask] = useState<HomeTask | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [punchTaskId, setPunchTaskId] = useState<string | null>(null)
  const [punchTaskName, setPunchTaskName] = useState<string>("")
  const [punchListOpen, setPunchListOpen] = useState(false)
  const [gateStatuses, setGateStatuses] = useState<any[]>([])
  const [planViewerOpen, setPlanViewerOpen] = useState(false)
  const [planViewerPlanId, setPlanViewerPlanId] = useState<string | null>(null)
  const [listedPlans, setListedPlans] = useState<ListedHomePlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [plansPanelOpen, setPlansPanelOpen] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [thumbnailViewerOpen, setThumbnailViewerOpen] = useState(false)
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null)
  const [justCompletedTaskId, setJustCompletedTaskId] = useState<string | null>(null)
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null)
  const [openCategories, setOpenCategories] = useState<string[]>([])
  const [markNaTask, setMarkNaTask] = useState<HomeTask | null>(null)
  const [markNaDialogOpen, setMarkNaDialogOpen] = useState(false)
  const [catchUpOpen, setCatchUpOpen] = useState(false)
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [rescheduleHistoryRefresh, setRescheduleHistoryRefresh] = useState(0)
  const [headerCardEl, setHeaderCardEl] = useState<HTMLDivElement | null>(null)
  const headerInView = useHouseHeaderInView(headerCardEl, home?.id)

  /** Bumps on every local task patch — stale forecast responses never replace status. */
  const mutationGenRef = useRef(0)
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconcileInFlightRef = useRef(0)
  const pendingReconcileRef = useRef<{
    homeId: string
    refreshGates: boolean
    /** Prefer GET /homes (no CPM recompute) when true for all coalesced requests. */
    skipRecompute: boolean
  } | null>(null)
  const activePerfRef = useRef<MutationPerfSession | null>(null)

  const applyLocalTaskPatch = (updated: { id: string; [key: string]: unknown }) => {
    mutationGenRef.current += 1
    setHome((prev) => patchHomeTask(prev, updated) as Home | null)
    setSelectedTask((prev) =>
      prev && prev.id === updated.id
        ? (mergeHomeTask(prev, updated) as HomeTask)
        : prev
    )
  }

  const runBackgroundReconcile = (homeId: string) => {
    const pending = pendingReconcileRef.current
    if (!pending || pending.homeId !== homeId) return
    pendingReconcileRef.current = null

    const skipRecompute = pending.skipRecompute
    const refreshGates = pending.refreshGates
    const flightId = ++reconcileInFlightRef.current
    const startedGen = mutationGenRef.current
    activePerfRef.current?.mark("t4")

    const url = skipRecompute
      ? `/api/homes/${homeId}`
      : `/api/homes/${homeId}/forecast`

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          if (!skipRecompute) {
            const fallback = await fetch(`/api/homes/${homeId}`)
            return fallback.ok ? fallback.json() : null
          }
          return null
        }
        const data = await res.json()
        if (data?.error) return null
        return data
      })
      .then((data) => {
        if (flightId !== reconcileInFlightRef.current) return
        if (!data) return
        // Always merge forecast-derived fields only — never full setHome after mutations.
        // startedGen is recorded for instrumentation; applyForecastReconcileToHome
        // already preserves mutation-confirmed status fields.
        void startedGen
        setHome((prev) =>
          prev ? (applyForecastReconcileToHome(prev, data) as Home) : prev
        )
        activePerfRef.current?.mark("t5")
        activePerfRef.current?.finish()
        activePerfRef.current = null
      })
      .catch(() => {})

    if (refreshGates) {
      fetch(`/api/homes/${homeId}/gates`)
        .then((res) => res.json())
        .then((data) => {
          if (flightId !== reconcileInFlightRef.current) return
          setGateStatuses(Array.isArray(data) ? data : [])
        })
        .catch(() => {})
    }
  }

  const scheduleBackgroundReconcile = (opts: {
    homeId: string
    kind: TaskMutationKind
  }) => {
    const needsGates = mutationNeedsGateRefresh(opts.kind)
    const skipRecompute = mutationForecastAlreadyPersisted(opts.kind)
    const prev = pendingReconcileRef.current
    pendingReconcileRef.current = {
      homeId: opts.homeId,
      refreshGates: Boolean(prev?.refreshGates) || needsGates,
      // Only skip recompute if every coalesced mutation already persisted forecast.
      skipRecompute: prev
        ? prev.skipRecompute && skipRecompute
        : skipRecompute,
    }
    if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current)
    reconcileTimerRef.current = setTimeout(() => {
      reconcileTimerRef.current = null
      runBackgroundReconcile(opts.homeId)
    }, FORECAST_RECONCILE_DEBOUNCE_MS)
  }

  /**
   * P1 path: patch local task from mutation response, then background reconcile.
   * Does not await forecast before showing the confirmed change.
   */
  const handleTaskMutation = (result: TaskMutationClientResult) => {
    const homeId = params.id as string | undefined
    if (result.task) {
      applyLocalTaskPatch(result.task)
      activePerfRef.current?.mark("t3")
      if (result.kind === "complete" && result.task.status === "Completed") {
        playTaskComplete()
        setJustCompletedTaskId(result.task.id as string)
        window.setTimeout(() => {
          setJustCompletedTaskId((id) =>
            id === result.task!.id ? null : id
          )
        }, 320)
      }
    }
    if (homeId) {
      scheduleBackgroundReconcile({ homeId, kind: result.kind })
    }
    if (result.kind === "reschedule") {
      setRescheduleHistoryRefresh((n) => n + 1)
      setActivityRefreshKey((n) => n + 1)
    }
    if (result.kind === "na" || result.kind === "complete") {
      setActivityRefreshKey((n) => n + 1)
    }
    if (result.closeModal !== false) {
      setModalOpen(false)
    }
  }

  const refreshHomeData = () => {
    if (!params.id) return
    const homeId = params.id as string
    fetch(`/api/homes/${homeId}`)
      .then(async (res) => (res.ok ? ((await res.json()) as Home) : null))
      .then((data) => {
        if (data) setHome(data)
      })
      .catch(() => {})
    // Explicit full refresh (catch-up / generate schedule) — allow full replace once.
    fetch(`/api/homes/${homeId}/forecast`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, data: d })))
      .then(({ ok, data }) => {
        if (ok && data && !data.error) setHome(data)
      })
      .catch(() => {})
    setRescheduleHistoryRefresh((n) => n + 1)
    setActivityRefreshKey((n) => n + 1)
  }

  useEffect(() => {
    return () => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!params.id) return
    const homeId = params.id as string

    // Fast path: load home from GET /api/homes/[id] so schedule shows immediately (no forecast recompute)
    setHomeError(null)
    fetch(`/api/homes/${homeId}`)
      .then(async (res): Promise<{ data: Home | null; status: number }> => {
        if (res.ok) {
          const data = await res.json() as Home
          return { data, status: res.status }
        }
        return { data: null, status: res.status }
      })
      .then(({ data, status }) => {
        if (data) {
          setHome(data)
          setHomeError(null)
          setLoading(false)
        } else {
          setHome(null)
          setHomeError(status === 403 ? "forbidden" : "not_found")
          setLoading(false)
        }
        if (!data) return
        // Background: refresh with forecast (recompute); update home when done
        fetch(`/api/homes/${homeId}/forecast`)
          .then((res) => res.json().then((d) => ({ ok: res.ok, data: d })))
          .then(({ ok, data }) => {
            if (ok && data && !data.error) setHome(data)
          })
          .catch(() => {})
      })
      .catch((err) => {
        console.error(err)
        setHome(null)
        setHomeError("not_found")
        setLoading(false)
      })

    // Fetch gate statuses in parallel
    fetch(`/api/homes/${homeId}/gates`)
      .then((res) => res.json())
      .then((data) => setGateStatuses(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to fetch gate statuses:", err))
  }, [params.id])

  // Fetch thumbnail signed URL when home is loaded (try every time; API returns exists: false if none)
  useEffect(() => {
    if (!params.id || !home) {
      setThumbnailUrl(null)
      return
    }
    fetch(`/api/homes/${params.id}/thumbnail`)
      .then((res) => res.json())
      .then((data) => {
        if (data.exists && data.signedUrl) setThumbnailUrl(data.signedUrl)
        else setThumbnailUrl(null)
      })
      .catch(() => setThumbnailUrl(null))
  }, [params.id, home?.id])

  useEffect(() => {
    if (!home?.id) {
      setListedPlans([])
      return
    }
    setPlansLoading(true)
    fetch(`/api/homes/${home.id}/plans`)
      .then((res) => res.json())
      .then((data: { plans?: ListedHomePlan[] }) => {
        setListedPlans(Array.isArray(data.plans) ? data.plans : [])
      })
      .catch(() => setListedPlans([]))
      .finally(() => setPlansLoading(false))
  }, [home?.id])

  useEffect(() => {
    setPlansPanelOpen(false)
  }, [home?.id])

  useEffect(() => {
    if (listedPlans.length <= 1) setPlansPanelOpen(false)
  }, [listedPlans.length])

  const planOpenHref = (planId: string) =>
    home?.id
      ? `/api/homes/${home.id}/plan?planId=${encodeURIComponent(planId)}&open=1`
      : "#"

  const legacyPlanHint =
    !!(home?.planStoragePath || home?.planName || home?.planVariant || home?.hasPlan)

  // Deep-link: ?task=<id> opens modal (Flow). ?task=<id>&highlight=1 scrolls + soft-highlights (Calendar).
  useEffect(() => {
    const taskId = searchParams.get("task")
    if (!taskId || !home?.tasks) return
    const task = home.tasks.find((t) => t.id === taskId)
    if (!task) return

    const highlightOnly = searchParams.get("highlight") === "1"
    const category =
      task.templateItem?.optionalCategory?.trim() || "Uncategorized"

    setOpenCategories((prev) =>
      prev.includes(category) ? prev : [...prev, category]
    )

    if (highlightOnly) {
      setHighlightTaskId(taskId)
      const scrollTimer = window.setTimeout(() => {
        document
          .getElementById(`work-item-${taskId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 80)
      const clearTimer = window.setTimeout(() => {
        setHighlightTaskId((id) => (id === taskId ? null : id))
      }, 2100)
      return () => {
        window.clearTimeout(scrollTimer)
        window.clearTimeout(clearTimer)
      }
    }

    setSelectedTask(task)
    setModalOpen(true)
  }, [home?.tasks, searchParams])

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case "Completed":
        return "success"
      case "Confirmed":
        return "default"
      case "PendingConfirm":
        return "warning"
      case "Declined":
        return "destructive"
      case "InProgress":
        return "default"
      default:
        return "outline"
    }
  }

  const handleTaskClick = (task: HomeTask) => {
    if (!canEdit) return
    setSelectedTask(task)
    setModalOpen(true)
  }

  const handlePunchClick = (e: React.MouseEvent, task: HomeTask) => {
    e.stopPropagation()
    setPunchTaskId(task.id)
    setPunchTaskName(task.nameSnapshot)
    setPunchListOpen(true)
  }

  const handleShareWorkItemWhatsApp = (e: React.MouseEvent, task: HomeTask) => {
    e.stopPropagation()
    if (!home) return
    const text = buildWorkItemWhatsAppText({
      contextLabel: home.subdivision?.name ?? undefined,
      homeLabel: home.addressOrLot,
      taskName: task.nameSnapshot,
      status: task.status,
      scheduledDate: task.scheduledDate ?? undefined,
      contractorName: task.contractor?.companyName ?? undefined,
      homeId: home.id,
      taskId: task.id,
    })
    openWhatsAppShare(text)
    if (typeof window !== "undefined") {
      console.log("share_whatsapp_work_item", { taskId: task.id, homeId: home.id })
    }
  }

  const handleShareWorkItemEmail = (e: React.MouseEvent, task: HomeTask) => {
    e.stopPropagation()
    if (!home) return
    const text = buildWorkItemWhatsAppText({
      contextLabel: home.subdivision?.name ?? undefined,
      homeLabel: home.addressOrLot,
      taskName: task.nameSnapshot,
      status: task.status,
      scheduledDate: task.scheduledDate ?? undefined,
      contractorName: task.contractor?.companyName ?? undefined,
      homeId: home.id,
      taskId: task.id,
    })
    const subject = [home.subdivision?.name, home.addressOrLot].filter(Boolean).join(" – ") + " – " + task.nameSnapshot
    openEmailShare(text, subject)
    if (typeof window !== "undefined") {
      console.log("share_email_work_item", { taskId: task.id, homeId: home.id })
    }
  }

  const handleMarkCompleted = (e: React.MouseEvent, task: HomeTask) => {
    e.stopPropagation()
    setMarkingTaskId(task.id)
    const perf = beginMutationPerf("complete")
    activePerfRef.current = perf
    perf.mark("t1")
    fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Completed" as TaskStatus }),
    })
      .then((res) => {
        if (res.ok) return res.json()
        return res.json().then((data) => Promise.reject(new Error(data?.error || "Failed to update")))
      })
      .then((updatedTask) => {
        perf.mark("t2")
        handleTaskMutation({
          task: updatedTask,
          kind: "complete",
          closeModal: false,
        })
      })
      .catch((err) => {
        activePerfRef.current = null
        alert(err.message || "Failed to mark completed")
      })
      .finally(() => setMarkingTaskId(null))
  }

  const handlePunchUpdate = () => {
    if (!params.id) return
    scheduleBackgroundReconcile({
      homeId: params.id as string,
      kind: "punch",
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!home) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-lg font-medium text-foreground">
          {homeError === "forbidden"
            ? "You don't have access to this home."
            : "Home not found."}
        </p>
        <Link
          href={homesListRestoreHref()}
          className="text-primary underline-offset-2 hover:underline"
        >
          ← Back to Homes
        </Link>
      </div>
    )
  }

  const canEdit =
    session?.user?.role === "Superintendent" ||
    session?.user?.role === "Admin" ||
    session?.user?.role === "Manager"
  const canMarkComplete =
    session?.user?.role === "Superintendent" ||
    session?.user?.role === "Admin" ||
    session?.user?.role === "Manager"
  const canCatchUpSchedule =
    session?.user?.role === "Admin" ||
    session?.user?.role === "Manager"

  // Define category order (case-insensitive matching)
  const categoryOrder = [
    "Preliminary work",
    "Preliminary",
    "Foundation",
    "Structural",
    "Interior finishes / Exterior rough work",
    "Finals punches and inspections",
    "Pre-sale completion package",
  ]

  // Group tasks by category (guard against missing tasks)
  const tasksList = home.tasks ?? []
  const safeGateStatuses = Array.isArray(gateStatuses) ? gateStatuses : []

  // Use server-computed reason when available; otherwise fall back to gate-status check for backward compatibility
  const getTaskBlockedReason = (task: HomeTask): string | null => {
    if (task.schedulingBlockedReason) return task.schedulingBlockedReason
    const blockingGate = safeGateStatuses.find((gate) => {
      if (!gate.isBlocked) return false
      const gateTaskData = tasksList.find((t) => t.id === gate.taskId)
      if (!gateTaskData) return false
      if (gate.gateScope === "AllScheduling") return task.id !== gate.taskId
      if (gate.gateScope === "DownstreamOnly")
        return task.sortOrderSnapshot > gateTaskData.sortOrderSnapshot
      return false
    })
    return blockingGate
      ? "Scheduling blocked - gate punch items must be resolved"
      : null
  }
  const isTaskBlocked = (task: HomeTask) => !!getTaskBlockedReason(task)

  const tasksByCategory = tasksList.reduce((acc, task) => {
    const category = task.templateItem?.optionalCategory || "Uncategorized"
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(task)
    return acc
  }, {} as Record<string, HomeTask[]>)

  // Calculate progress for a category
  const calculateCategoryProgress = (tasks: HomeTask[]) => {
    const total = tasks.length
    const excluded = tasks.filter((t) => isExcludedFromProgress(t.status)).length
    const completed = tasks.filter((t) => t.status === "Completed").length
    const notApplicable = tasks.filter((t) => t.status === "NotApplicable").length
    const applicable = total - excluded
    return {
      total: applicable,
      completed,
      notApplicable,
      progress: applicable > 0 ? Math.round((completed / applicable) * 100) : 0,
    }
  }

  const scheduledTaskCount = tasksList.filter((t) => t.scheduledDate != null).length
  const barStatus = getBarScheduleStatus(
    home.forecastCompletionDate ?? null,
    home.targetCompletionDate ?? null,
    { startDate: home.startDate, scheduledTaskCount }
  )

  const scheduleStatus: ScheduleStatus | null = barStatus
  const today = startOfDay(new Date())

  // Sort categories - Preliminary work always first, then by predefined order
  const sortedCategories = Object.keys(tasksByCategory).sort((a, b) => {
    const aLower = a.toLowerCase().trim()
    const bLower = b.toLowerCase().trim()
    
    // Normalize "prelliminary" typo to "preliminary" for sorting
    const aNormalized = aLower.replace("prelliminary", "preliminary")
    const bNormalized = bLower.replace("prelliminary", "preliminary")
    
    // Preliminary always comes FIRST - check this before anything else
    const aIsPreliminary = aNormalized.includes("preliminary")
    const bIsPreliminary = bNormalized.includes("preliminary")
    
    if (aIsPreliminary && !bIsPreliminary) return -1 // a comes first
    if (!aIsPreliminary && bIsPreliminary) return 1  // b comes first
    if (aIsPreliminary && bIsPreliminary) {
      // Both are preliminary, sort alphabetically
      return a.localeCompare(b)
    }
    
    // Neither is preliminary, use predefined order
    const aIndex = categoryOrder.findIndex(
      (orderCat) => orderCat.toLowerCase().trim() === aLower
    )
    const bIndex = categoryOrder.findIndex(
      (orderCat) => orderCat.toLowerCase().trim() === bLower
    )
    
    // Both have defined order
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    
    // Only a has defined order (should come first)
    if (aIndex !== -1) return -1
    
    // Only b has defined order (should come first)
    if (bIndex !== -1) return 1
    
    // Neither has defined order, sort alphabetically
    return a.localeCompare(b)
  })

  const orderedTasksForCatchUp = sortedCategories.flatMap((category) =>
    [...(tasksByCategory[category] ?? [])].sort(
      (a, b) => a.sortOrderSnapshot - b.sortOrderSnapshot
    )
  )

  return (
    <div className="min-h-screen bg-gray-100 pb-24 pt-20">
      <HouseDetailStickyAddress
        address={home.addressOrLot}
        show={!headerInView}
        onScrollToTop={() => {
          headerCardEl?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
      />
      <div className="app-container">
        <Button
          variant="ghost"
          asChild
          className="-ml-2 mb-2 text-muted-foreground hover:text-foreground"
        >
          <Link href={homesListRestoreHref()}>← Homes</Link>
        </Button>

        {/* Header card */}
        <Card ref={setHeaderCardEl} id="house-detail-header" className="mb-4 scroll-mt-20">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">{home.addressOrLot}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {home.subdivision?.name ?? "—"}
                  {(home.planName || home.planVariant) && (
                    <span> • {[home.planName, home.planVariant].filter(Boolean).join(" – ")}</span>
                  )}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {scheduleStatus && <StatusPill status={scheduleStatus} />}
                    {plansLoading && legacyPlanHint && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        className="h-8 gap-1.5 rounded-full"
                        aria-busy="true"
                      >
                        <FileText className="h-4 w-4" />
                        Plans…
                      </Button>
                    )}
                    {!plansLoading && listedPlans.length === 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPlanViewerPlanId(listedPlans[0]!.id)
                          setPlanViewerOpen(true)
                        }}
                        className="h-8 gap-1.5 rounded-full"
                      >
                        <FileText className="h-4 w-4" />
                        View Plan
                      </Button>
                    )}
                    {!plansLoading && listedPlans.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-full"
                        aria-expanded={plansPanelOpen}
                        aria-controls="house-plans-panel"
                        id="house-plans-trigger"
                        onClick={() => setPlansPanelOpen((o) => !o)}
                      >
                        <FileText className="h-4 w-4" />
                        <span className="tabular-nums">
                          Plans {plansPanelOpen ? "\u25b4" : "\u25be"}
                        </span>
                      </Button>
                    )}
                    {home.addressOrLot?.trim() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-full"
                        onClick={() => {
                          const query = [home.addressOrLot, home.subdivision?.name].filter(Boolean).join(", ")
                          const encoded = encodeURIComponent(query)
                          const isIOS =
                            typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)
                          const url = isIOS
                            ? `https://maps.apple.com/?q=${encoded}`
                            : `https://www.google.com/maps/search/?api=1&query=${encoded}`
                          window.open(url, "_blank", "noopener,noreferrer")
                        }}
                        title="Open location in native maps"
                        aria-label="Open in Maps"
                      >
                        <MapPin className="h-4 w-4" />
                        Open in Maps
                      </Button>
                    )}
                  </div>
                  {!plansLoading && listedPlans.length > 1 && plansPanelOpen && (
                    <div
                      id="house-plans-panel"
                      role="region"
                      aria-labelledby="house-plans-trigger"
                      className="max-w-md rounded-lg border border-border/80 bg-muted/25 px-2.5 py-2 text-sm shadow-sm"
                    >
                      {Array.from(groupPlansByTag(listedPlans).entries()).map(([tag, items]) => (
                        <div key={tag} className="mb-2.5 last:mb-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {tag}
                          </p>
                          <ul className="mt-1 space-y-1 pl-0 list-none">
                            {items.map((p) => (
                              <li
                                key={p.id}
                                className="flex items-center gap-2 min-w-0 border-b border-border/40 pb-1 last:border-0 last:pb-0"
                              >
                                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={p.fileName}>
                                  {p.fileName}
                                  {p.planFileType === "PDF" ? " (PDF)" : ""}
                                </span>
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 px-2 text-primary"
                                >
                                  <a
                                    href={planOpenHref(p.id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open
                                  </a>
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {(() => {
                  const totalTasks = tasksList.filter((t) => !isExcludedFromProgress(t.status)).length
                  const completedTasks = tasksList.filter((t) => t.status === "Completed").length
                  const naTasks = tasksList.filter((t) => t.status === "NotApplicable").length
                  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
                  return (
                    <>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {completedTasks} / {totalTasks} tasks completed
                        {naTasks > 0 ? ` · ${naTasks} N/A` : ""}
                      </p>
                      <div className="mt-2 w-full min-w-0">
                        <ProgressBar value={progress} status={barStatus} showChevron={false} />
                      </div>
                    </>
                  )
                })()}
              </div>
              {thumbnailUrl && (
                <button
                  type="button"
                  onClick={() => setThumbnailViewerOpen(true)}
                  className="shrink-0 w-full sm:w-40 md:w-48 aspect-[4/3] rounded-lg overflow-hidden border border-border bg-white flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-label="View house thumbnail full size"
                >
                  <img
                    src={thumbnailUrl}
                    alt={`${home.addressOrLot}`}
                    className="w-full h-full object-contain pointer-events-none"
                  />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Timeline: Start / Forecast / Target in chronological order */}
        {home.startDate && (home.forecastCompletionDate || home.targetCompletionDate) && (
          <Card className="mb-4 overflow-hidden">
            <CardContent className="relative p-4 overflow-hidden">
              <div className="overflow-hidden">
                <ScheduleTimeline
                  startDate={home.startDate}
                  targetDate={home.targetCompletionDate ?? null}
                  forecastDate={home.forecastCompletionDate ?? null}
                  today={today}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <HouseScheduleCard
          tasks={tasksList}
          onTaskClick={
            canEdit
              ? (task) => {
                  const full = tasksList.find((t) => t.id === task.id)
                  if (full) handleTaskClick(full)
                }
              : undefined
          }
        />

        <GenerateScheduleCard
          homeId={home.id}
          canGenerate={canEdit}
          onApplied={refreshHomeData}
        />

        {/* Activity Timeline */}
        {session?.user && (session.user as any).role !== "Subcontractor" && (
          <div className="mb-4 space-y-4">
            <HomeRescheduleHistory homeId={home.id} refreshKey={rescheduleHistoryRefresh} />
            <HomeActivityTimeline homeId={home.id} initialLimit={5} refreshKey={activityRefreshKey} />
          </div>
        )}

        {/* Phase cards — same width as timeline card above */}
        <div>
        {canCatchUpSchedule && sortedCategories.length > 0 && (
          <Card className="mb-4">
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Bulk recovery</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mark multiple past work items completed to bring this home up to date.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setCatchUpOpen(true)}
              >
                Catch Up Schedule
              </Button>
            </CardContent>
          </Card>
        )}
        {sortedCategories.length === 0 ? (
          <Card className="mb-4">
            <CardContent className="py-10 text-center">
              <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="font-medium text-muted-foreground">No work items for this home</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Work items are created from the work template when a home is added. If this home was created before template items were set up, add work items template in Settings → Work Items Template, then create a new home to get the full list.
              </p>
            </CardContent>
          </Card>
        ) : (
        <Accordion
          type="multiple"
          className="w-full space-y-3"
          value={openCategories}
          onValueChange={setOpenCategories}
        >
          {sortedCategories.map((category) => {
            const categoryTasks = tasksByCategory[category]
            const { total, completed, notApplicable, progress } = calculateCategoryProgress(categoryTasks)

            return (
              <AccordionItem key={category} value={category} className="border-none">
                <Card>
                  <AccordionTrigger className="group px-5 py-4 hover:no-underline [&>svg]:hidden [&[data-state=open]_svg]:rotate-90">
                    <div className="flex w-full flex-col items-start gap-2 text-left">
                      <div className="flex w-full items-center justify-between">
                        <span className="font-semibold">
                          {category.replace(/Prelliminary/gi, "Preliminary")}
                        </span>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          View tasks <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {completed} / {total} tasks completed
                        {notApplicable > 0 ? ` · ${notApplicable} N/A` : ""}
                      </p>
                      <div className="w-full">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-green-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pt-2">
                    {categoryTasks.map((task) => {
                      const blocked = isTaskBlocked(task)
                      return (
                        <Card
                          key={task.id}
                          id={`work-item-${task.id}`}
                          className={cn(
                            "rounded-lg border shadow-none motion-safe:transition-[background-color,border-color,box-shadow,opacity] motion-safe:duration-300 motion-safe:ease-out",
                            canEdit ? "cursor-pointer hover:bg-gray-50/80" : "",
                            task.status === "Completed"
                              ? "bg-green-50/80 border-green-200"
                              : "",
                            justCompletedTaskId === task.id &&
                              "bg-green-100/90 border-green-300 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.25)]",
                            highlightTaskId === task.id &&
                              "bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/60 shadow-sm",
                            task.status === "NotApplicable"
                              ? "bg-gray-50/80 border-gray-200"
                              : "",
                            blocked
                              ? "border-orange-300 bg-orange-50/50"
                              : "border-gray-200/80"
                          )}
                          onClick={() => canEdit && handleTaskClick(task)}
                        >
                          <div className="px-4 py-3">
                            {/* Title row: name + status pill + gate/critical badges */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <CardTitle className="text-base font-semibold leading-tight">
                                  {task.nameSnapshot}
                                </CardTitle>
                                {blocked && (
                                  <Lock className="h-3.5 w-3.5 shrink-0 text-orange-600" aria-hidden />
                                )}
                                {task.templateItem?.isCriticalGate && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
                                    Gate
                                  </Badge>
                                )}
                                {task.isCriticalPath && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                                    Critical
                                  </Badge>
                                )}
                                {task.reportedCompleteAt && task.status !== "Completed" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 font-medium border-amber-300 bg-amber-50 text-amber-900"
                                  >
                                    Reported complete
                                  </Badge>
                                )}
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 text-xs font-medium px-2 py-0.5 rounded-md motion-safe:transition-[opacity,transform,background-color,color] motion-safe:duration-300 motion-safe:ease-out",
                                  task.status === "Completed" && "bg-green-100 text-green-800",
                                  justCompletedTaskId === task.id &&
                                    "opacity-100 translate-y-0 bg-green-200/90 text-green-900",
                                  task.status === "NotApplicable" && "bg-gray-100 text-gray-600",
                                  task.status === "Unscheduled" && "bg-gray-100 text-gray-600",
                                  (task.status === "Scheduled" || task.status === "Confirmed") && "bg-blue-50 text-blue-700",
                                  task.status === "PendingConfirm" && "bg-amber-50 text-amber-700",
                                  task.status === "InProgress" && "bg-blue-100 text-blue-800",
                                  task.status === "Declined" && "bg-gray-100 text-gray-700",
                                  task.status === "Canceled" && "bg-gray-100 text-gray-500"
                                )}
                              >
                                {badgeLabelForTaskStatus(task.status)}
                              </span>
                            </div>
                            {blocked && (
                              <p className="text-[11px] text-orange-600 mt-0.5" title={getTaskBlockedReason(task) ?? undefined}>
                                {getTaskBlockedReason(task)}
                              </p>
                            )}
                            {task.status === "NotApplicable" && task.notApplicableReason && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {labelForNotApplicableReason(task.notApplicableReason)}
                                {task.notApplicableReason === "other" && task.notApplicableNote
                                  ? ` — “${task.notApplicableNote}”`
                                  : ""}
                              </p>
                            )}
                            {task.reportedCompleteAt && task.status !== "Completed" && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Reported by{" "}
                                {task.reportedCompleteBy?.name ??
                                  task.contractor?.companyName ??
                                  "Contractor"}{" "}
                                · {format(new Date(task.reportedCompleteAt), "MMM d, yyyy h:mm a")}
                                {task.reportedCompleteNote ? ` — “${task.reportedCompleteNote}”` : ""}
                              </p>
                            )}
                            <WorkItemMetadata
                              durationDays={task.durationDaysSnapshot}
                              contractorName={task.contractor?.companyName}
                              calledAt={task.lastConfirmationAt}
                              scheduledDate={
                                task.status !== "NotApplicable" && task.scheduledDate
                                  ? normalizeStoredScheduledDate(new Date(task.scheduledDate))
                                  : null
                              }
                              startedAt={task.startedAt}
                              completedAt={task.completedAt}
                              punchOpenCount={task.hasOpenPunch ? task.punchOpenCount : 0}
                            />
                            {/* Compact action row: Mark Completed (builder-side only) + Add Punch */}
                            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
                              {canMarkComplete &&
                                task.status !== "NotApplicable" &&
                                (task.status === "Scheduled" ||
                                  task.status === "PendingConfirm" ||
                                  task.status === "Confirmed" ||
                                  task.status === "InProgress") &&
                                (task.reportedCompleteAt ? (
                                  <Button
                                    size="sm"
                                    onClick={(e) => handleMarkCompleted(e, task)}
                                    disabled={markingTaskId === task.id}
                                    className="bg-green-600 hover:bg-green-700 shrink-0 min-h-[44px] h-9 px-3"
                                  >
                                    {markingTaskId === task.id ? "Saving…" : "Verify & complete"}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={(e) => handleMarkCompleted(e, task)}
                                    disabled={markingTaskId === task.id}
                                    title={markingTaskId === task.id ? "Saving..." : "Mark complete"}
                                    aria-label={markingTaskId === task.id ? "Saving..." : "Mark complete"}
                                    className="bg-green-600 hover:bg-green-700 shrink-0 h-9 w-9 p-0"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                ))}
                              {canEdit &&
                                task.status !== "Completed" &&
                                task.status !== "NotApplicable" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setMarkNaTask(task)
                                      setMarkNaDialogOpen(true)
                                    }}
                                    title="Mark Not Applicable"
                                    aria-label="Mark Not Applicable"
                                    className="shrink-0 h-11 w-11 min-h-[44px] min-w-[44px] p-0 text-gray-700"
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleShareWorkItemWhatsApp(e, task)}
                                className="shrink-0 h-9 w-9 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Share via WhatsApp"
                                aria-label="Share via WhatsApp"
                              >
                                <WhatsAppIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleShareWorkItemEmail(e, task)}
                                className="shrink-0 h-9 w-9 p-0"
                                title="Share via email"
                                aria-label="Share via email"
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                              {(canEdit ||
                                session?.user?.role === "Manager" ||
                                session?.user?.role === "Superintendent") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => handlePunchClick(e, task)}
                                  className="shrink-0 min-h-[44px] h-9 px-3"
                                >
                                  <ClipboardList className="h-4 w-4 mr-1" />
                                  {task.hasOpenPunch ? "View Punch" : "Add Punch"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                    </div>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            )
          })}
        </Accordion>
        )}
        </div>
      </div>

      {canEdit && selectedTask && (
        <TaskModal
          task={selectedTask}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onUpdate={(result) => {
            const perf = beginMutationPerf(result.kind)
            activePerfRef.current = perf
            perf.mark("t2")
            handleTaskMutation(result)
          }}
          homeLabel={home.addressOrLot}
        />
      )}

      {markNaTask && (
        <MarkNotApplicableDialog
          open={markNaDialogOpen}
          onOpenChange={(open) => {
            setMarkNaDialogOpen(open)
            if (!open) setMarkNaTask(null)
          }}
          task={markNaTask}
          onSuccess={(updated) => {
            const perf = beginMutationPerf("na")
            activePerfRef.current = perf
            perf.mark("t2")
            handleTaskMutation({
              task: updated as { id: string },
              kind: "na",
              closeModal: false,
            })
            setMarkNaTask(null)
          }}
        />
      )}

      {canCatchUpSchedule && (
        <CatchUpScheduleDialog
          open={catchUpOpen}
          onOpenChange={setCatchUpOpen}
          homeId={home.id}
          orderedTasks={orderedTasksForCatchUp}
          onSuccess={refreshHomeData}
        />
      )}

      {punchTaskId && (
        <PunchItemsList
          taskId={punchTaskId}
          taskName={punchTaskName}
          open={punchListOpen}
          onOpenChange={setPunchListOpen}
          onUpdate={handlePunchUpdate}
          homeId={home.id}
          homeLabel={home.addressOrLot}
          contextLabel={home.subdivision?.name ?? undefined}
        />
      )}

      <PlanViewer
        homeId={home.id}
        addressOrLot={home.addressOrLot}
        planName={home.planName}
        planVariant={home.planVariant}
        planId={planViewerPlanId}
        open={planViewerOpen}
        onOpenChange={(open) => {
          setPlanViewerOpen(open)
          if (!open) setPlanViewerPlanId(null)
        }}
      />

      <ImageViewer
        imageUrl={thumbnailUrl}
        title={home.addressOrLot}
        open={thumbnailViewerOpen}
        onOpenChange={setThumbnailViewerOpen}
      />
    </div>
  )
}
