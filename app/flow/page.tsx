"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Search } from "lucide-react"
import { FlowQueueRow } from "@/components/flow/flow-queue-row"
import { TaskActionSheet } from "@/components/flow/task-action-sheet"
import { groupFlowByHome } from "@/lib/flow/groupFlowByHome"
import { computeFlowBriefing } from "@/lib/flow/briefing"
import type { FlowAction } from "@/lib/flow/types"

const EXIT_MS = 300

export default function FlowPage() {
  const { data: session, status } = useSession()
  const [actions, setActions] = useState<FlowAction[]>([])
  const [circularWarning, setCircularWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sheetAction, setSheetAction] = useState<FlowAction | null>(null)
  const [exitingHomeIds, setExitingHomeIds] = useState<Set<string>>(() => new Set())
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const fetchFlow = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const params = new URLSearchParams()
    if (search.trim()) params.set("search", search.trim())
    const qs = params.toString()
    fetch(`/api/flow${qs ? `?${qs}` : ""}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setActions([])
          setCircularWarning(null)
          return
        }
        setActions(Array.isArray(data.actions) ? data.actions : [])
        setCircularWarning(data.circularWarning ?? null)
        setExitingHomeIds(new Set())
      })
      .catch(() => {
        setActions([])
        setCircularWarning(null)
      })
      .finally(() => {
        if (!opts?.silent) setLoading(false)
      })
  }, [search])

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

  useEffect(() => {
    return () => {
      for (const timer of exitTimers.current.values()) clearTimeout(timer)
      exitTimers.current.clear()
    }
  }, [])

  const handleScheduleSuccess = useCallback(
    (homeId: string) => {
      setSheetAction(null)
      setExitingHomeIds((prev) => {
        const next = new Set(prev)
        next.add(homeId)
        return next
      })

      const existing = exitTimers.current.get(homeId)
      if (existing) clearTimeout(existing)

      const timer = setTimeout(() => {
        setActions((prev) => prev.filter((a) => a.homeId !== homeId))
        setExitingHomeIds((prev) => {
          const next = new Set(prev)
          next.delete(homeId)
          return next
        })
        exitTimers.current.delete(homeId)
        fetchFlow({ silent: true })
      }, EXIT_MS)
      exitTimers.current.set(homeId, timer)
    },
    [fetchFlow]
  )

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
        <h1 className="mb-1 text-2xl font-bold text-foreground">Flow</h1>
        <p className="text-sm text-muted-foreground">
          Next critical action for every active house — sorted by urgency.
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
          <div className="mt-4 flex flex-wrap gap-2">
            {briefing.overdueCount > 0 && (
              <div className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                <span className="mr-1">Overdue</span>
                <span>{briefing.overdueCount}</span>
              </div>
            )}
            {briefing.atRiskCount > 0 && (
              <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                <span className="mr-1">At Risk</span>
                <span>{briefing.atRiskCount}</span>
              </div>
            )}
            {briefing.readyCount > 0 && (
              <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="mr-1">Ready</span>
                <span>{briefing.readyCount}</span>
              </div>
            )}
            {briefing.futureCount > 0 && (
              <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
                <span className="mr-1">Future</span>
                <span>{briefing.futureCount}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
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

        <div className="mt-6 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-8 text-center text-sm text-muted-foreground">
              All clear. No critical scheduling actions right now.
            </div>
          ) : (
            groups.map((group) => {
              const nextAction = group.actions[0]
              if (!nextAction) return null
              return (
                <FlowQueueRow
                  key={group.homeId}
                  group={group}
                  action={nextAction}
                  exiting={exitingHomeIds.has(group.homeId)}
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
        onSuccess={() => fetchFlow({ silent: true })}
        onScheduleSuccess={(homeId) => handleScheduleSuccess(homeId)}
      />
    </div>
  )
}
