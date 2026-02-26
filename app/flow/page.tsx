"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { ChevronLeft, Search } from "lucide-react"
import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { FlowFeedItem } from "@/components/flow/flow-feed-item"
import type { FlowAction } from "@/lib/flow/types"

type Scope = "today" | "next7" | "overdue"
type Filter = "all" | "prep" | "execute"

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "next7", label: "Next 7 days" },
  { value: "overdue", label: "Overdue" },
]

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "prep", label: "Prep" },
  { value: "execute", label: "Execute" },
]

export default function FlowPage() {
  const { data: session, status } = useSession()
  const [actions, setActions] = useState<FlowAction[]>([])
  const [circularWarning, setCircularWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<Scope>("today")
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")

  const fetchFlow = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("scope", scope)
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
  }, [scope, filter, search])

  useEffect(() => {
    if (session?.user && ["Admin", "Manager", "Superintendent"].includes((session.user as { role?: string }).role ?? "")) {
      fetchFlow()
    } else {
      setLoading(false)
    }
  }, [session, fetchFlow])

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
        <p className="text-muted-foreground">Flow is available only for Admin, Manager, and Superintendent.</p>
        <Link href="/homes" className="mt-4 text-primary hover:underline">
          ← Back to Homes
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-16">
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/homes"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">Homes</span>
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-foreground">Flow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flow shows what to do today to stay on schedule.
        </p>

        {circularWarning && (
          <div
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            {circularWarning}
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Time range</p>
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    scope === opt.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-white text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
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

        <div className="mt-6">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : actions.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-8 text-center text-sm text-muted-foreground">
              No actions match your filters.
            </div>
          ) : (
            <ul className="space-y-4">
              {actions.map((action) => (
                <li key={`${action.taskInstanceId}-${action.type}`}>
                  <FlowFeedItem action={action} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Navigation />
    </div>
  )
}
