"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Calendar, ZoomIn, ZoomOut, FileDown, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Navigation } from "@/components/navigation"
import { format, startOfDay } from "date-fns"
import { addWorkingDays } from "@/lib/working-days"
import dynamic from "next/dynamic"
import type { GanttTask } from "@/components/gantt/template-gantt-client"

const TemplateGanttClient = dynamic(
  () =>
    import("@/components/gantt/template-gantt-client").then((m) => ({
      default: m.TemplateGanttClient,
    })),
  { ssr: false }
)

type GanttApiResponse = {
  projectStartDate: string
  tasks: Array<{
    id: string
    name: string
    category: string | null
    durationDays: number
    startDate: string
    endDate: string
    dependencyIds: string[]
    sequenceOrder?: number
    isCritical: boolean
    depth: number
  }>
  links: Array<{ from: string; to: string }>
  criticalPathIds: string[]
  cycleDetected: boolean
  cycleTaskIds: string[]
  error?: string
}

function nextWorkingDay(): Date {
  const today = startOfDay(new Date())
  return addWorkingDays(today, 1)
}

export default function TemplateGanttPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [projectStart, setProjectStart] = useState<string>(() =>
    format(nextWorkingDay(), "yyyy-MM-dd")
  )
  const [viewMode, setViewMode] = useState<"Week" | "Month">("Month")
  const [data, setData] = useState<GanttApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null)

  useEffect(() => {
    if (session?.user?.role !== "Admin") {
      router.replace("/admin")
      return
    }
  }, [session?.user?.role, router])

  const fetchGantt = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("projectStartDate", new Date(projectStart).toISOString())
      const res = await fetch(`/api/admin/templates/gantt?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setData(null)
        return
      }
      const json: GanttApiResponse = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [projectStart])

  useEffect(() => {
    if (session?.user?.role !== "Admin") return
    fetchGantt()
  }, [session?.user?.role, fetchGantt])

  const handleExportCSV = useCallback(() => {
    if (!data?.tasks.length) return
    const headers = ["Task", "Category", "Start", "End", "Duration (days)", "Dependencies", "Critical Path"]
    const rows = data.tasks.map((t) => [
      t.name,
      t.category ?? "",
      t.startDate.slice(0, 10),
      t.endDate.slice(0, 10),
      String(t.durationDays),
      t.dependencyIds.join("; "),
      t.isCritical ? "Yes" : "No",
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `template-gantt-${projectStart}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [data, projectStart])

  if (session?.user?.role !== "Admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Access denied. Redirecting…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container max-w-[1600px] mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/admin?tab=work-templates">
              <Button variant="ghost" size="icon" aria-label="Back to Work Items Template">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold">Work Items Template – Gantt</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <label htmlFor="project-start" className="text-sm font-medium">
                Project start
              </label>
              <input
                id="project-start"
                type="date"
                value={projectStart}
                onChange={(e) => setProjectStart(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Zoom:</span>
              <Button
                variant={viewMode === "Week" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("Week")}
              >
                <ZoomIn className="h-4 w-4 mr-1" />
                Week
              </Button>
              <Button
                variant={viewMode === "Month" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("Month")}
              >
                <ZoomOut className="h-4 w-4 mr-1" />
                Month
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data?.tasks?.length}>
              <FileDown className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>

        {data?.cycleDetected && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{data.error ?? "A dependency cycle was detected. Fix the template dependencies to view the Gantt chart."}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Loading…
          </div>
        ) : data?.tasks?.length ? (
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <TemplateGanttClient
                tasks={data.tasks as GanttTask[]}
                links={data.links}
                projectStartDate={data.projectStartDate}
                viewMode={viewMode}
                onTaskSelect={setSelectedTask}
              />
            </div>
            {selectedTask && (
              <aside className="w-80 shrink-0 rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Task details</h3>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{selectedTask.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Category</dt>
                    <dd>{selectedTask.category ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd>{selectedTask.durationDays} working days</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Start</dt>
                    <dd>{format(new Date(selectedTask.startDate), "MMM d, yyyy")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Finish</dt>
                    <dd>{format(new Date(selectedTask.endDate), "MMM d, yyyy")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Dependencies</dt>
                    <dd>{selectedTask.dependencyIds.length ? selectedTask.dependencyIds.join(", ") : "None"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Critical path</dt>
                    <dd>{selectedTask.isCritical ? "Yes" : "No"}</dd>
                  </div>
                </dl>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => setSelectedTask(null)}
                >
                  Close
                </Button>
              </aside>
            )}
          </div>
        ) : !loading && data && !data.cycleDetected ? (
          <div className="py-20 text-center text-muted-foreground">
            No work items in template. Add items in Work Items Template to see the Gantt.
          </div>
        ) : null}
      </main>
    </div>
  )
}
