"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Search } from "lucide-react"
import { FlowQueueRow } from "@/components/flow/flow-queue-row"
import { TaskActionSheet } from "@/components/flow/task-action-sheet"
import { groupFlowByHome } from "@/lib/flow/groupFlowByHome"
import { computeFlowBriefing } from "@/lib/flow/briefing"
import type { FlowAction } from "@/lib/flow/types"

type Filter = "all" | "prep" | "execute"

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "prep", label: "Get ready" },
  { value: "execute", label: "Start work" },
]

export default function FlowPage() {
  const { data: session, status } = useSession()
  const [actions, setActions] = useState<FlowAction[]>([])
  const [circularWarning, setCircularWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [sheetAction, setSheetAction] = useState<FlowAction | null>(null)

  const fetchFlow = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("filter", filter)
    if (search.trim()) params.set("search", search.trim())
    fetch(`/api/flow?${params.toString()}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setActions([])
          setCircularWarning(null)
          return
        }
        setActions(Array.isArray(data.actions) ? data.actions : [])
        setCircularWarning(data.circularWarning ?? null)
      })
      .catch(() => {
        setActions([])
        setCircularWarning(null)
      })
      .finally(() => setLoading(false))
  }, [filter, search])

  useEffect(() => {
    if (
      session?.user &&
      ["Admin", "Manager", "Superintendent"].includes(
        (session.user as { role?: string }).role ?? ""
      )
    ) {
      fetchFlow()
    } else {
      setLoading(false)
    }
  }, [session, fetchFlow])

  const groups = groupFlowByHome(actions)
  const briefing = computeFlowBriefing(groups)

  if (status === "loading" || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const role = (session.user as { role?: string }).role ?? ""
  if (!["Admin", "Manager", "Superintendent"].includes(role)) {
    return (
      <div className="flex min-h-screen flex-col p-4 pt-20">
        <p className="text-muted-foreground">
          Flow is available only for Admin, Manager, and Superintendent.
        </p>
        <Link href="/homes" className="mt-4 text-primary hover:underline">
          ← Back to Homes
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-28 pt-16">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Flow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flow shows what to do today to keep homes moving, including overdue items and prep or ordering work.
        </p>

        {circularWarning && (
          <div
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            {circularWarning}
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Daily briefing</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Here&apos;s what needs attention to keep homes moving.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {briefing.notStartedHomes > 0 && (
                <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  <span className="mr-1">Not started</span>
                  <span>{briefing.notStartedHomes}</span>
                </div>
              )}
              <div className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                <span className="mr-1">Overdue</span>
                <span>{briefing.overdueCount}</span>
              </div>
              <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                <span className="mr-1">Due today</span>
                <span>{briefing.dueTodayCount}</span>
              </div>
              <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="mr-1">Start work</span>
                <span>{briefing.startWorkCount}</span>
              </div>
              <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                <span className="mr-1">Slipping homes</span>
                <span>{briefing.slippingHomes}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Filter</p>
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    filter === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-white text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="flow-search" className="sr-only">
              Search address, task, or contractor
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="flow-search"
                type="search"
                placeholder="Search address, task, contractor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-8 text-center text-sm text-muted-foreground">
              You’re clear for today. No immediate actions are required.
            </div>
          ) : (
            groups.map((group) => {
              const nextAction = group.actions[0]
              if (!nextAction) return null
              return (
                <FlowQueueRow
                  key={`${group.homeId}-${nextAction.taskInstanceId}`}
                  group={group}
                  action={nextAction}
                  onOpenAction={setSheetAction}
                />
              )
            })
          )}
        </div>
      </div>
      <TaskActionSheet
        open={!!sheetAction}
        onOpenChange={(open) => !open && setSheetAction(null)}
        flowAction={sheetAction}
        onSuccess={fetchFlow}
      />
    </div>
  )
}
