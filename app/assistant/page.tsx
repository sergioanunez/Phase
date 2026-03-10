"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Sparkles } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

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

const ASSISTANT_PROMPTS = [
  "Why is 644 Paseo behind schedule?",
  "Show homes finishing this month",
  "Which phase is most overloaded?",
  "What needs attention today?",
]

export default function AssistantPage() {
  const { data: session } = useSession()
  const [snapshot, setSnapshot] = useState<AssistantSnapshot>({
    portfolio: null,
    phaseDistribution: null,
    flowActions: [],
  })
  const [loading, setLoading] = useState(true)
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [sparkle, setSparkle] = useState(true)

  useEffect(() => {
    setSparkle(true)
    const t = setTimeout(() => setSparkle(false), 800)
    return () => clearTimeout(t)
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
        if (!cancelled) {
          setSnapshot({
            portfolio: null,
            phaseDistribution: null,
            flowActions: [],
          })
        }
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

  const notStartedPhase = phases.find((p) =>
    p.key?.toLowerCase().includes("not_started")
  )

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
  ).slice(0, 3)

  const upcomingCritical = snapshot.flowActions
    .filter((a) => !a.isOverdue)
    .slice(0, 5)

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles
                className={`h-5 w-5 text-sky-600 ${sparkle ? "animate-assistant-sparkle" : ""}`}
              />
              <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Your live construction snapshot and schedule insights.
            </p>
          </div>
        </header>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {session?.user?.name ? "Today's construction snapshot" : "Today's construction snapshot"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && !portfolio ? (
                <p className="text-sm text-muted-foreground">Loading live snapshot…</p>
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

                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-foreground">Risk summary</p>
                    {uniqueRiskHomes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No homes are currently flagged as overdue in today's Flow.
                      </p>
                    ) : (
                      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                        {uniqueRiskHomes.map((a) => (
                          <li key={a.homeId}>
                            <span className="font-medium text-foreground">
                              {a.homeAddress}
                            </span>{" "}
                            is overdue on{" "}
                            <span className="font-medium text-foreground">
                              {a.taskName}
                            </span>
                            {typeof a.slackWorkingDays === "number" && (
                              <> ({Math.abs(a.slackWorkingDays)} working days behind target)</>
                            )}
                            .
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-foreground">Build pipeline</p>
                    {mostActivePhase ? (
                      <p className="text-muted-foreground">
                        Most active phase:{" "}
                        <span className="font-medium text-foreground">
                          {mostActivePhase.name}
                        </span>{" "}
                        ({mostActivePhase.count} homes).
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Phase distribution will appear here once active homes are scheduled.
                      </p>
                    )}
                    {notStartedPhase && (
                      <p className="text-muted-foreground">
                        Homes not started:{" "}
                          <span className="font-medium text-foreground">
                            {notStartedPhase.count}
                          </span>
                        .
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-foreground">Upcoming critical actions</p>
                    {upcomingCritical.length === 0 ? (
                      <p className="text-muted-foreground">
                        No critical actions surfaced in today's Flow list.
                      </p>
                    ) : (
                      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                        {upcomingCritical.map((a) => (
                          <li key={`${a.homeId}-${a.taskName}-${a.actionDate}`}>
                            <span className="font-medium text-foreground">
                              {a.taskName}
                            </span>{" "}
                            for {a.homeAddress}{" "}
                            <span className="text-xs">
                              ({a.type === "PREP" ? "get ready" : "start work"})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Quick questions for Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {ASSISTANT_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-dashed text-xs"
                    onClick={() => setSelectedPrompt(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
              {selectedPrompt && (
                <p className="text-xs text-muted-foreground">
                  Selected question:{" "}
                  <span className="font-medium text-foreground">
                    {selectedPrompt}
                  </span>
                  . This will be answered by the AI assistant as chat capabilities are rolled out.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Navigation />
    </div>
  )
}

