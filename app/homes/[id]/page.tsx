"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Navigation } from "@/components/navigation"
import { TaskModal } from "@/components/task-modal"
import { PunchItemsList } from "@/components/punch-items-list"
import { TaskStatus } from "@prisma/client"
import { format, isBefore, isAfter, startOfDay } from "date-fns"
import { ClipboardList, Lock, FileText, Upload, Check, ChevronRight } from "lucide-react"
import { PlanViewer } from "@/components/plan-viewer"
import { ImageViewer } from "@/components/image-viewer"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface HomeTask {
  id: string
  nameSnapshot: string
  status: TaskStatus
  scheduledDate: string | null
  completedAt: string | null
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
  planUploadedAt?: string | null
  tasks: HomeTask[]
}

export default function HomeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const [home, setHome] = useState<Home | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<HomeTask | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [punchTaskId, setPunchTaskId] = useState<string | null>(null)
  const [punchTaskName, setPunchTaskName] = useState<string>("")
  const [punchListOpen, setPunchListOpen] = useState(false)
  const [gateStatuses, setGateStatuses] = useState<any[]>([])
  const [planViewerOpen, setPlanViewerOpen] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [thumbnailViewerOpen, setThumbnailViewerOpen] = useState(false)
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null)

  useEffect(() => {
    if (params.id) {
      // Load full home (address, subdivision, tasks) from GET /api/homes/[id]; forecast API is a stub and returns no real data
      fetch(`/api/homes/${params.id}`)
        .then((res) => {
          if (!res.ok) {
            setHome(null)
            setLoading(false)
            return
          }
          return res.json()
        })
        .then((data) => {
          if (data != null) setHome(data)
          setLoading(false)
        })
        .catch((err) => {
          console.error(err)
          setHome(null)
          setLoading(false)
        })

      // Fetch gate statuses
      fetch(`/api/homes/${params.id}/gates`)
        .then((res) => res.json())
        .then((data) => {
          setGateStatuses(data)
        })
        .catch((err) => {
          console.error("Failed to fetch gate statuses:", err)
        })
    }
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
    if (session?.user?.role === "Superintendent" || session?.user?.role === "Admin") {
      setSelectedTask(task)
      setModalOpen(true)
    }
  }

  const handleTaskUpdate = () => {
    if (params.id) {
      fetch(`/api/homes/${params.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setHome(data)
        })
      
      // Refresh gate statuses
      fetch(`/api/homes/${params.id}/gates`)
        .then((res) => res.json())
        .then((data) => {
          setGateStatuses(data)
        })
        .catch((err) => {
          console.error("Failed to fetch gate statuses:", err)
        })
    }
    setModalOpen(false)
  }

  const handlePunchClick = (e: React.MouseEvent, task: HomeTask) => {
    e.stopPropagation()
    setPunchTaskId(task.id)
    setPunchTaskName(task.nameSnapshot)
    setPunchListOpen(true)
  }

  const handleMarkCompleted = (e: React.MouseEvent, task: HomeTask) => {
    e.stopPropagation()
    setMarkingTaskId(task.id)
    fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Completed" as TaskStatus }),
    })
      .then((res) => {
        if (res.ok) return res.json()
        return res.json().then((data) => Promise.reject(new Error(data?.error || "Failed to update")))
      })
      .then(() => {
        if (params.id) {
          fetch(`/api/homes/${params.id}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data) setHome(data)
            })
          fetch(`/api/homes/${params.id}/gates`)
            .then((res) => res.json())
            .then((data) => setGateStatuses(data))
            .catch(() => {})
        }
      })
      .catch((err) => alert(err.message || "Failed to mark completed"))
      .finally(() => setMarkingTaskId(null))
  }

  const handlePunchUpdate = () => {
    if (params.id) {
      fetch(`/api/homes/${params.id}`)
        .then((res) => res.json())
        .then((data) => {
          setHome(data)
        })
    }
  }

  // Use server-computed reason when available; otherwise fall back to gate-status check for backward compatibility
  const getTaskBlockedReason = (task: HomeTask): string | null => {
    if (task.schedulingBlockedReason) return task.schedulingBlockedReason
    const blockingGate = gateStatuses.find((gate) => {
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!home) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Home not found</div>
      </div>
    )
  }

  const canEdit = session?.user?.role === "Superintendent" || session?.user?.role === "Admin"
  const canMarkComplete =
    session?.user?.role === "Superintendent" ||
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
    const canceled = tasks.filter((t) => t.status === "Canceled").length
    const completed = tasks.filter((t) => t.status === "Completed").length
    return {
      total: total - canceled,
      completed,
      progress: total - canceled > 0 ? Math.round((completed / (total - canceled)) * 100) : 0,
    }
  }

  // Schedule status: ahead / on / behind based on forecast vs target
  const getScheduleStatus = () => {
    if (!home.forecastCompletionDate || !home.targetCompletionDate) return null
    const forecast = startOfDay(new Date(home.forecastCompletionDate))
    const target = startOfDay(new Date(home.targetCompletionDate))
    if (isBefore(forecast, target)) return { label: "Ahead of schedule", variant: "success" as const }
    if (isAfter(forecast, target)) return { label: "Behind schedule", variant: "destructive" as const }
    return { label: "On schedule", variant: "default" as const }
  }
  const scheduleStatus = getScheduleStatus()
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

  return (
    <div className="min-h-screen bg-gray-100 pb-24 pt-20">
      <div className="app-container">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="-ml-2 mb-2 text-muted-foreground hover:text-foreground"
        >
          ← Homes
        </Button>

        {/* Header card */}
        <Card className="mb-4">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">{home.addressOrLot}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {home.subdivision?.name ?? "—"}
                  {home.hasPlan && (home.planName || home.planVariant) && (
                    <span> • {[home.planName, home.planVariant].filter(Boolean).join(" – ")}</span>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {scheduleStatus && (
                    <Badge variant={scheduleStatus.variant} className="gap-1 rounded-full px-3 py-1">
                      <Check className="h-3.5 w-3.5" />
                      {scheduleStatus.label}
                    </Badge>
                  )}
                  {home.hasPlan && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPlanViewerOpen(true)}
                      className="h-8 gap-1.5 rounded-full"
                    >
                      <FileText className="h-4 w-4" />
                      View Plan
                    </Button>
                  )}
                </div>
                {(() => {
                  const totalTasks = tasksList.filter((t) => t.status !== "Canceled").length
                  const completedTasks = tasksList.filter((t) => t.status === "Completed").length
                  return (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {completedTasks} / {totalTasks} tasks completed
                    </p>
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

        {/* Timeline */}
        {home.startDate && (home.forecastCompletionDate || home.targetCompletionDate) && (
          <Card className="mb-4">
            <CardContent className="relative p-5">
              <div className="relative flex items-end justify-between">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Start</span>
                  <span className="mt-1 text-sm font-semibold">{format(new Date(home.startDate), "MMM d")}</span>
                  <div className="relative z-10 mt-2 h-3 w-3 rounded-full bg-green-500" />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Forecast</span>
                  <span className="mt-1 text-sm font-semibold">
                    {home.forecastCompletionDate
                      ? (format(new Date(home.forecastCompletionDate), "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
                        ? "Today"
                        : format(new Date(home.forecastCompletionDate), "MMM d"))
                      : "—"}
                  </span>
                  <div className="relative z-10 mt-2 h-3 w-3 rounded-full bg-green-500" />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Target</span>
                  <span className="mt-1 text-sm font-semibold">
                    {home.targetCompletionDate ? format(new Date(home.targetCompletionDate), "MMM d") : "—"}
                  </span>
                  <div className="relative z-10 mt-2 h-3 w-3 rounded-full border-2 border-green-500 bg-white" />
                </div>
              </div>
              <div
                className="absolute left-[16.666%] right-[16.666%] top-[72px] h-0.5 bg-green-200"
                aria-hidden
              />
            </CardContent>
          </Card>
        )}

        {/* Phase cards or empty state */}
        {sortedCategories.length === 0 ? (
          <Card className="mb-4">
            <CardContent className="py-10 text-center">
              <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="font-medium text-muted-foreground">No work items for this home</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Work items are created from the work template when a home is added. If this home was created before template items were set up, add work items template in Admin → Work Items Template, then create a new home to get the full list.
              </p>
            </CardContent>
          </Card>
        ) : (
        <Accordion type="multiple" className="w-full space-y-3">
          {sortedCategories.map((category) => {
            const categoryTasks = tasksByCategory[category]
            const { total, completed, progress } = calculateCategoryProgress(categoryTasks)

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
                          className={`rounded-lg border shadow-none ${
                            canEdit ? "cursor-pointer hover:bg-gray-50/80 transition-colors" : ""
                          } ${
                            task.status === "Completed" ? "bg-green-50/80 border-green-200" : ""
                          } ${blocked ? "border-orange-300 bg-orange-50/50" : "border-gray-200/80"}`}
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
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 text-xs font-medium px-2 py-0.5 rounded-md",
                                  task.status === "Completed" && "bg-green-100 text-green-800",
                                  task.status === "Unscheduled" && "bg-gray-100 text-gray-600",
                                  (task.status === "Scheduled" || task.status === "Confirmed") && "bg-blue-50 text-blue-700",
                                  task.status === "PendingConfirm" && "bg-amber-50 text-amber-700",
                                  (task.status === "InProgress" || task.status === "Declined") && "bg-gray-100 text-gray-700",
                                  task.status === "Canceled" && "bg-gray-100 text-gray-500"
                                )}
                              >
                                {task.status}
                              </span>
                            </div>
                            {blocked && (
                              <p className="text-[11px] text-orange-600 mt-0.5" title={getTaskBlockedReason(task) ?? undefined}>
                                {getTaskBlockedReason(task)}
                              </p>
                            )}
                            {/* Compact meta row: Duration • Punches (and optional Scheduled/Completed/Contractor) */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              <span>
                                Duration: {task.durationDaysSnapshot} working day{task.durationDaysSnapshot === 1 ? "" : "s"}
                              </span>
                              {task.hasOpenPunch && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span className="text-destructive font-medium">Punches: {task.punchOpenCount}</span>
                                </>
                              )}
                              {task.scheduledDate && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span>Scheduled: {format(new Date(task.scheduledDate), "MM/dd/yyyy")}</span>
                                </>
                              )}
                              {task.completedAt && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span>Completed: {format(new Date(task.completedAt), "MM/dd/yyyy")}</span>
                                </>
                              )}
                              {task.contractor && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span>Contractor: {task.contractor.companyName}</span>
                                </>
                              )}
                            </div>
                            {/* Compact action row: Mark Completed (builder-side only) + Add Punch */}
                            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
                              {canMarkComplete &&
                                (task.status === "Scheduled" ||
                                  task.status === "PendingConfirm" ||
                                  task.status === "Confirmed" ||
                                  task.status === "InProgress") && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => handleMarkCompleted(e, task)}
                                    disabled={markingTaskId === task.id}
                                    className="bg-green-600 hover:bg-green-700 shrink-0 min-h-[44px] h-9 px-3"
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    {markingTaskId === task.id ? "Saving..." : "Mark Completed"}
                                  </Button>
                                )}
                              {(canEdit || session?.user?.role === "Manager") && (
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

      {canEdit && selectedTask && (
        <TaskModal
          task={selectedTask}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onUpdate={handleTaskUpdate}
        />
      )}

      {punchTaskId && (
        <PunchItemsList
          taskId={punchTaskId}
          taskName={punchTaskName}
          open={punchListOpen}
          onOpenChange={setPunchListOpen}
          onUpdate={handlePunchUpdate}
        />
      )}

      <PlanViewer
        homeId={home.id}
        addressOrLot={home.addressOrLot}
        planName={home.planName}
        planVariant={home.planVariant}
        open={planViewerOpen}
        onOpenChange={setPlanViewerOpen}
      />

      <ImageViewer
        imageUrl={thumbnailUrl}
        title={home.addressOrLot}
        open={thumbnailViewerOpen}
        onOpenChange={setThumbnailViewerOpen}
      />

      <Navigation />
    </div>
  )
}
