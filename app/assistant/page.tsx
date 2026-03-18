"use client"

import { useEffect, useState, useCallback, useId } from "react"
import { useSession } from "next-auth/react"
import { Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AssistantFeed, type FeedItem } from "@/components/assistant/AssistantFeed"
import { AssistantCommandInput } from "@/components/assistant/AssistantCommandInput"
import type { ExecutePreviewPayload } from "@/lib/assistant/types"

type StatusCounts = {
  notStarted: number
  onTrack: number
  atRisk: number
  behind: number
}

type PortfolioData = {
  activeHomesCount: number
  statusCounts: StatusCounts
}

type PhaseRow = {
  key: string
  name: string
  count: number
}

type PhaseDistribution = {
  phases: PhaseRow[]
  totalActiveHomes: number
}

type FlowAction = {
  homeId: string
  homeAddress: string
  subdivisionName: string
  taskName: string
  type: "PREP" | "EXECUTE"
  actionDate: string
  isOverdue: boolean
  slackWorkingDays?: number | null
}

type AssistantSnapshot = {
  portfolio: PortfolioData | null
  phaseDistribution: PhaseDistribution | null
  flowActions: FlowAction[]
}

const QUICK_PROMPTS = [
  "What needs attention today",
  "Schedule upcoming tasks",
  "Create a punchlist",
  "What materials should be ordered this week",
  "Why is this home delayed",
  "Show homes finishing this month",
]

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

type LoadingPhase = "pipeline" | "schedule" | "insights" | "complete"

export default function AssistantPage() {
  const { data: session } = useSession()
  const [snapshot, setSnapshot] = useState<AssistantSnapshot>({
    portfolio: null,
    phaseDistribution: null,
    flowActions: [],
  })
  const [loading, setLoading] = useState(true)
  const [inputValue, setInputValue] = useState("")
  const [sparkle, setSparkle] = useState(true)
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("pipeline")
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [processingStage, setProcessingStage] = useState(0)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const idGen = useId()

  useEffect(() => {
    setSparkle(true)
    const t = setTimeout(() => setSparkle(false), 800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion()) {
      setLoadingPhase("complete")
      return
    }
    const timers: number[] = []
    timers.push(
      window.setTimeout(() => setLoadingPhase("schedule"), 1200),
      window.setTimeout(() => setLoadingPhase("insights"), 2400),
      window.setTimeout(() => setLoadingPhase("complete"), 3600)
    )
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const [portfolioRes, overviewRes, flowRes] = await Promise.all([
          fetch("/api/dashboard/portfolio", { credentials: "same-origin" }),
          fetch("/api/dashboard/overview", { credentials: "same-origin" }),
          fetch("/api/flow?filter=all", { credentials: "same-origin" }),
        ])
        const portfolioJson = portfolioRes.ok ? await portfolioRes.json() : null
        const overviewJson = overviewRes.ok ? await overviewRes.json() : null
        const flowJson = flowRes.ok ? await flowRes.json() : null
        if (cancelled) return
        setSnapshot({
          portfolio: portfolioJson
            ? {
                activeHomesCount: portfolioJson.activeHomesCount ?? 0,
                statusCounts: portfolioJson.statusCounts ?? {
                  notStarted: 0,
                  onTrack: 0,
                  atRisk: 0,
                  behind: 0,
                },
              }
            : null,
          phaseDistribution: overviewJson?.phaseDistribution ?? null,
          flowActions: (flowJson?.actions as FlowAction[]) ?? [],
        })
      } catch {
        if (!cancelled)
          setSnapshot({
            portfolio: null,
            phaseDistribution: null,
            flowActions: [],
          })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const portfolio = snapshot.portfolio
  const status = portfolio?.statusCounts ?? {
    notStarted: 0,
    onTrack: 0,
    atRisk: 0,
    behind: 0,
  }
  const phases = snapshot.phaseDistribution?.phases ?? []
  const mostActivePhase =
    phases.length > 0
      ? phases.reduce((max, p) => (p.count > max.count ? p : max), phases[0])
      : null
  const overdueActions = snapshot.flowActions.filter((a) => a.isOverdue)
  const uniqueRiskHomes = Array.from(
    overdueActions.reduce<Map<string, FlowAction>>((map, action) => {
      const existing = map.get(action.homeId)
      if (!existing) {
        map.set(action.homeId, action)
      } else {
        const aSlack = action.slackWorkingDays ?? 9999
        const eSlack = existing.slackWorkingDays ?? 9999
        if (aSlack < eSlack) map.set(action.homeId, action)
      }
      return map
    }, new Map()).values()
  )
  const needsAttentionToday = uniqueRiskHomes.slice(0, 8)

  const handleSend = useCallback(
    async (text: string) => {
      setInputValue("")
      const userItem: FeedItem = {
        id: `user-${idGen}-${Date.now()}`,
        type: "user",
        text,
      }
      setFeedItems((prev) => [...prev, userItem])
      setProcessing(true)
      setProcessingStage(0)
      const stageDuration = prefersReducedMotion() ? 0 : 1000
      const stages = [
        "Analyzing your construction pipeline…",
        "Checking schedule health…",
        "Preparing insights…",
      ]
      let stageIndex = 0
      const stageInterval =
        stageDuration > 0
          ? window.setInterval(() => {
              setProcessingStage((s) => {
                const next = s + 1
                if (next >= 3) return s
                return next
              })
            }, stageDuration)
          : null
      const minDelay = prefersReducedMotion() ? 0 : 2800
      const start = Date.now()
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ message: text }),
        })
        const elapsed = Date.now() - start
        if (minDelay > elapsed && stageInterval) {
          await new Promise((r) => setTimeout(r, minDelay - elapsed))
        }
        if (stageInterval) window.clearInterval(stageInterval)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFeedItems((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              type: "assistant",
              text: data?.error ?? "Something went wrong. Try again.",
            },
          ])
          return
        }
        if (data.kind === "EXECUTE" && data.preview) {
          const previewId = `preview-${Date.now()}`
          const preview: ExecutePreviewPayload = data.preview
          const onApprove = async () => {
            setExecutingId(previewId)
            try {
              const execRes = await fetch("/api/assistant/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(buildExecuteBody(preview)),
              })
              const execData = await execRes.json().catch(() => ({}))
              setFeedItems((prev) => [
                ...prev,
                {
                  id: `result-${Date.now()}`,
                  type: "execution_result",
                  text: execData.message ?? (execRes.ok ? "Done." : execData.error ?? "Failed."),
                  success: execRes.ok,
                },
              ])
            } catch {
              setFeedItems((prev) => [
                ...prev,
                {
                  id: `result-${Date.now()}`,
                  type: "execution_result",
                  text: "Execution failed. Try again.",
                  success: false,
                },
              ])
            } finally {
              setExecutingId(null)
            }
          }
          const onCancel = () => {
            setFeedItems((prev) => [
              ...prev.filter((it) => !(it.type === "preview" && it.id === previewId)),
              {
                id: `cancel-${Date.now()}`,
                type: "assistant" as const,
                text: "Action cancelled.",
              },
            ])
          }
          setFeedItems((prev) => [
            ...prev,
            {
              id: previewId,
              type: "preview",
              text: data.message,
              preview,
              onApprove,
              onCancel,
              loading: false,
            },
          ])
        } else {
          setFeedItems((prev) => [
            ...prev,
            {
              id: `ast-${Date.now()}`,
              type: "assistant",
              text: data.message ?? "",
            },
          ])
        }
      } catch {
        setFeedItems((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            type: "assistant",
            text: "Could not reach the Assistant. Try again.",
          },
        ])
      } finally {
        setProcessing(false)
        setProcessingStage(0)
      }
    },
    [idGen]
  )

  function buildExecuteBody(preview: ExecutePreviewPayload): Record<string, unknown> {
    if (preview.type === "schedule_task") {
      return {
        action: "schedule_task",
        homeId: preview.homeId,
        taskId: preview.taskId,
        scheduledDate: preview.scheduledDate,
        contractorId: preview.contractorId ?? null,
      }
    }
    if (preview.type === "create_punchlist") {
      return {
        action: "create_punchlist",
        homeId: preview.homeId,
        taskId: preview.taskId,
        items: preview.items,
        dueDate: preview.dueDate ?? null,
      }
    }
    if (preview.type === "create_material_request") {
      return {
        action: "create_material_request",
        homeId: preview.homeId ?? null,
        material: preview.material,
        quantity: preview.quantity,
        neededBy: preview.neededBy ?? null,
      }
    }
    return {}
  }

  const renderProcessingMessage = () => {
    const messages = [
      "Analyzing your construction pipeline…",
      "Checking schedule health…",
      "Preparing insights…",
    ]
    const msg = messages[Math.min(processingStage, 2)]
    return (
      <div className="flex justify-start">
        <Card className="max-w-[95%] border-sky-200 bg-sky-50/50">
          <CardContent className="py-3">
            <p className="text-sm font-medium text-sky-800">Assistant</p>
            <p className="mt-1 text-sm text-sky-700">{msg}</p>
            {!prefersReducedMotion() && (
              <div className="mt-2 flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-200 [animation-delay:300ms]" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const initialLoading =
    loadingPhase !== "complete" && (
      <div className="flex min-h-[180px] items-center justify-center">
        <Card className="w-full max-w-md text-center shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-sky-600" />
              Assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-foreground">
              {loadingPhase === "pipeline"
                ? "Analyzing your construction pipeline…"
                : loadingPhase === "schedule"
                  ? "Checking schedule health…"
                  : "Preparing insights…"}
            </p>
            {!prefersReducedMotion() && (
              <div className="mt-3 flex justify-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-200 [animation-delay:300ms]" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-64 pt-20">
      <div className="app-container mx-auto max-w-2xl px-4">
        <header className="mb-4">
          <div className="flex items-center gap-2">
            <Sparkles
              className={`h-5 w-5 text-sky-600 ${sparkle ? "animate-assistant-sparkle" : ""}`}
            />
            <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Construction operations command center. Ask, recommend, or execute with approval.
          </p>
        </header>

        <div className="space-y-4">
          {initialLoading}
          {loadingPhase === "complete" && (
            <>
              {/* Section 1: Daily Briefing */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Today&apos;s Construction Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading && !portfolio ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Active homes</p>
                          <p className="mt-1 text-lg font-semibold">
                            {portfolio?.activeHomesCount ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">On track</p>
                          <p className="mt-1 text-lg font-semibold text-green-600">
                            {status.onTrack}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">At risk</p>
                          <p className="mt-1 text-lg font-semibold text-amber-600">
                            {status.atRisk}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Behind</p>
                          <p className="mt-1 text-lg font-semibold text-red-600">
                            {status.behind}
                          </p>
                        </div>
                      </div>
                      {mostActivePhase && (
                        <p className="text-sm text-muted-foreground">
                          Most active phase:{" "}
                          <span className="font-medium text-foreground">{mostActivePhase.name}</span>
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Needs Attention Today */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Needs Attention Today</CardTitle>
                </CardHeader>
                <CardContent>
                  {needsAttentionToday.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No homes currently need immediate attention in today&apos;s Flow.
                    </p>
                  ) : (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {needsAttentionToday.map((a) => (
                        <li key={a.homeId}>
                          <span className="font-medium text-foreground">{a.homeAddress}</span>
                          {" — "}
                          {a.taskName}
                          {typeof a.slackWorkingDays === "number" && a.slackWorkingDays < 0 && (
                            <span className="text-red-600">
                              {" "}
                              ({Math.abs(a.slackWorkingDays)} days behind target)
                            </span>
                          )}
                          {a.isOverdue && !a.slackWorkingDays && (
                            <span className="text-amber-600"> Overdue.</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Section 2: Quick Action Prompts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Quick Action Prompts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <Button
                        key={prompt}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full border-dashed text-xs"
                        onClick={() => setInputValue(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Section 3: Conversation / Action Feed */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">
                    Conversation &amp; Action Feed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {processing && renderProcessingMessage()}
                  <AssistantFeed
                    items={feedItems.map((it) =>
                      it.type === "preview" && it.id === executingId
                        ? { ...it, loading: true }
                        : it
                    )}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Section 4: Command Input (sticky) */}
      {loadingPhase === "complete" && (
        <div className="fixed bottom-16 left-0 right-0 z-40 mx-auto max-w-2xl px-4">
          <AssistantCommandInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            disabled={processing}
            placeholder="Ask Assistant about your schedule or tell it what to do."
          />
        </div>
      )}

    </div>
  )
}
