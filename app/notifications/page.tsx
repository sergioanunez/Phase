"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bell, ChevronLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { format, formatDistanceToNow } from "date-fns"
import type { NotificationItem } from "@/app/api/notifications/route"
import { cn } from "@/lib/utils"

const BUILDER_ROLES = ["Admin", "Manager", "Superintendent"]

type HierarchyNotification = {
  id: string
  severity: "CRITICAL" | "ATTENTION" | "INFO"
  category: string
  title: string
  message: string
  entityType: string
  entityId: string | null
  homeId: string | null
  requiresAction: boolean
  reviewedAt: string | null
  resolvedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
}

const SEVERITY_BAND_CLASS: Record<string, string> = {
  CRITICAL: "bg-red-500/80",
  ATTENTION: "bg-amber-400/80",
  INFO: "bg-blue-400/70",
}

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "CRITICAL", label: "Critical" },
  { value: "ATTENTION", label: "Attention" },
  { value: "INFO", label: "Informational" },
  { value: "ACTION", label: "Requires Action" },
] as const

type FilterValue = (typeof FILTERS)[number]["value"]

function getViewHref(n: HierarchyNotification): string {
  if (n.homeId) return `/homes/${n.homeId}`
  return "/"
}

function filterNotifications(
  list: HierarchyNotification[],
  filter: FilterValue
): HierarchyNotification[] {
  if (filter === "ALL") return list
  if (filter === "ACTION") return list.filter((n) => n.requiresAction)
  return list.filter((n) => n.severity === filter)
}

interface NotificationCardProps {
  n: HierarchyNotification
  onMarkRead: (id: string) => void
  onResolve: (id: string) => void
  actioningId: string | null
}

function NotificationCard({ n, onMarkRead, onResolve, actioningId }: NotificationCardProps) {
  const isUnread = !n.reviewedAt
  const bandClass = SEVERITY_BAND_CLASS[n.severity] ?? "bg-gray-400/60"

  const handleClick = () => {
    if (isUnread) onMarkRead(n.id)
  }

  return (
    <article
      className={cn(
        "relative rounded-md border border-border bg-white py-3 pl-4 pr-4 shadow-sm transition-colors",
        isUnread && "bg-muted/30"
      )}
      onClick={handleClick}
    >
      <div
        className={cn("absolute left-0 top-0 h-full w-1.5 rounded-l-md", bandClass)}
        aria-hidden
      />
      <div className="flex flex-col gap-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "min-w-0 flex-1 text-sm",
              isUnread ? "font-semibold text-foreground" : "font-normal text-foreground"
            )}
          >
            {n.title}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{n.message}</p>
        {(n.requiresAction || n.homeId) && (
          <div className="mt-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            {n.homeId && (
              <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                <Link href={getViewHref(n)} onClick={() => isUnread && onMarkRead(n.id)}>
                  View
                </Link>
              </Button>
            )}
            {n.requiresAction && !n.resolvedAt && (
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={() => {
                  onMarkRead(n.id)
                  onResolve(n.id)
                }}
                disabled={actioningId === n.id}
              >
                {actioningId === n.id ? "Resolving…" : "Resolve"}
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export default function NotificationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [kind, setKind] = useState<"hierarchy" | "activity">("activity")
  const [hierarchyList, setHierarchyList] = useState<HierarchyNotification[]>([])
  const [activityList, setActivityList] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>("ALL")
  const [actioningId, setActioningId] = useState<string | null>(null)

  const isBuilder = session?.user && BUILDER_ROLES.includes(session.user.role)

  const role = session?.user?.role
  const description =
    role === "Superintendent"
      ? "Activity and alerts across your assigned homes."
      : role === "Manager"
        ? "Operational alerts and activity across your homes."
        : role === "Admin"
          ? "System activity and operational alerts for your organization."
          : "Recent alerts and activity."

  const fetchNotifications = useCallback(() => {
    if (status !== "authenticated") return
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { kind?: "hierarchy" | "activity"; notifications?: HierarchyNotification[] | NotificationItem[] }) => {
        setKind(data.kind ?? "activity")
        setHierarchyList(data.kind === "hierarchy" ? (data.notifications ?? []) as HierarchyNotification[] : [])
        setActivityList((data.notifications ?? []) as NotificationItem[])
      })
      .catch(() => {
        setHierarchyList([])
        setActivityList([])
      })
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
      return
    }
    if (status !== "authenticated") return
    setLoading(true)
    fetchNotifications()
  }, [status, router, fetchNotifications])

  const handleMarkRead = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" })
      if (res.ok) {
        setHierarchyList((prev) =>
          prev.map((n) => (n.id === id ? { ...n, reviewedAt: new Date().toISOString() } : n))
        )
      }
    },
    []
  )

  const handleMarkAllRead = useCallback(async () => {
    const res = await fetch("/api/notifications/mark-all-read", { method: "PATCH" })
    if (res.ok) {
      setHierarchyList((prev) =>
        prev.map((n) => ({ ...n, reviewedAt: new Date().toISOString() }))
      )
    }
  }, [])

  const handleResolve = useCallback(
    async (id: string) => {
      setActioningId(id)
      try {
        const res = await fetch(`/api/notifications/${id}/resolve`, { method: "POST" })
        if (res.ok) fetchNotifications()
      } finally {
        setActioningId(null)
      }
    },
    [fetchNotifications]
  )

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  const filteredList = filterNotifications(hierarchyList, filter)
  const unreadCount = hierarchyList.filter((n) => !n.reviewedAt).length

  return (
    <div className="min-h-screen bg-gray-100 pb-24 pt-20">
      <div className="app-container mx-auto max-w-2xl px-4 py-6">
        <header className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </header>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isBuilder ? description : "Events on your assigned homes (last 24 hours)."}
            </p>
          </div>
          {isBuilder && kind === "hierarchy" && unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-sm text-muted-foreground hover:underline shrink-0"
            >
              Mark all as read
            </button>
          )}
        </div>

        {isBuilder && kind === "hierarchy" && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : kind === "hierarchy" ? (
          filteredList.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                {filter === "ALL" ? "No notifications" : "No notifications match this filter"}
              </p>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {filteredList.map((n) => (
                <li key={n.id}>
                  <NotificationCard
                    n={n}
                    onMarkRead={handleMarkRead}
                    onResolve={handleResolve}
                    actioningId={actioningId}
                  />
                </li>
              ))}
            </ul>
          )
        ) : activityList.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No notifications in the last 24 hours</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {activityList.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/homes/${n.homeId}`}
                  className="block rounded-md border border-border bg-white py-3 px-4 shadow-sm transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-col gap-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{n.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(n.timestamp), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{n.subtitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.userName} · {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Navigation />
    </div>
  )
}
