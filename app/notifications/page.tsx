"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Bell,
  ChevronLeft,
  ClipboardList,
  Calendar,
  Check,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Info,
  Users,
  Wrench,
} from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { format, formatDistanceToNow } from "date-fns"
import type { NotificationItem } from "@/app/api/notifications/route"
import { cn } from "@/lib/utils"

const BUILDER_ROLES = ["Admin", "Manager", "Superintendent"]

type HierarchyNotification = {
  id: string
  severity: "CRITICAL" | "ATTENTION" | "INFO"
  category: "SCHEDULE" | "QUALITY" | "CONTRACTOR" | "SYSTEM"
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

const CATEGORY_ICON: Record<string, typeof Calendar> = {
  SCHEDULE: Calendar,
  QUALITY: ClipboardList,
  CONTRACTOR: Users,
  SYSTEM: Wrench,
}

const SEVERITY_ICON = {
  CRITICAL: AlertTriangle,
  ATTENTION: AlertTriangle,
  INFO: Info,
} as const

const TYPE_CONFIG: Record<
  NotificationItem["type"],
  { label: string; icon: typeof Bell; color: string }
> = {
  task_scheduled: { label: "Scheduled", icon: Calendar, color: "text-blue-600" },
  task_confirmed: { label: "Confirmed", icon: Check, color: "text-green-600" },
  task_completed: { label: "Completed", icon: Check, color: "text-green-600" },
  task_cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-600" },
  task_rescheduled: { label: "Rescheduled", icon: RefreshCw, color: "text-amber-600" },
  punch_added: { label: "Punch added", icon: ClipboardList, color: "text-violet-600" },
}

function getViewHref(n: HierarchyNotification): string {
  if (n.homeId) return `/homes/${n.homeId}`
  return "/"
}

export default function NotificationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [kind, setKind] = useState<"hierarchy" | "activity">("activity")
  const [hierarchyList, setHierarchyList] = useState<HierarchyNotification[]>([])
  const [activityList, setActivityList] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyRequiresAction, setOnlyRequiresAction] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [actioningId, setActioningId] = useState<string | null>(null)

  const isBuilder = session?.user && BUILDER_ROLES.includes(session.user.role)

  const role = session?.user?.role
  const description =
    role === "Superintendent"
      ? "Activity and alerts across your assigned homes. Resolve items that require attention."
      : role === "Manager"
        ? "Operational alerts and activity across your homes. Stay ahead of issues that require attention."
        : role === "Admin"
          ? "System activity and operational alerts for your organization. Review and resolve items that require action."
          : "Recent alerts and activity. Resolve items that require attention."

  const fetchNotifications = useCallback(() => {
    if (status !== "authenticated") return
    const params = new URLSearchParams()
    if (isBuilder && onlyRequiresAction) params.set("onlyRequiresAction", "true")
    if (isBuilder && categoryFilter) params.set("category", categoryFilter)
    fetch(`/api/notifications?${params.toString()}`)
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
  }, [status, isBuilder, onlyRequiresAction, categoryFilter])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
      return
    }
    if (status !== "authenticated") return
    setLoading(true)
    fetchNotifications()
  }, [status, router, fetchNotifications])

  const handleReview = async (id: string) => {
    setActioningId(id)
    try {
      const res = await fetch(`/api/notifications/${id}/review`, { method: "POST" })
      if (res.ok) fetchNotifications()
    } finally {
      setActioningId(null)
    }
  }

  const handleResolve = async (id: string) => {
    setActioningId(id)
    try {
      const res = await fetch(`/api/notifications/${id}/resolve`, { method: "POST" })
      if (res.ok) fetchNotifications()
    } finally {
      setActioningId(null)
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  const unreadCount = kind === "hierarchy" ? hierarchyList.filter((n) => !n.reviewedAt).length : 0

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

        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        {isBuilder ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            {description}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Events on your assigned homes (last 24 hours).
          </p>
        )}

        {isBuilder && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyRequiresAction}
                onChange={(e) => setOnlyRequiresAction(e.target.checked)}
                className="rounded border-gray-300"
              />
              Only requires action
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              <option value="SCHEDULE">Schedule</option>
              <option value="QUALITY">Quality</option>
              <option value="CONTRACTOR">Contractor</option>
              <option value="SYSTEM">System</option>
            </select>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {unreadCount} unread
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : kind === "hierarchy" ? (
          hierarchyList.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              {(["CRITICAL", "ATTENTION", "INFO"] as const).map((severity) => {
                const items = hierarchyList.filter((n) => n.severity === severity)
                if (items.length === 0) return null
                const titles = { CRITICAL: "Critical", ATTENTION: "Needs Attention", INFO: "Informational" }
                const Icon = SEVERITY_ICON[severity]
                return (
                  <section key={severity}>
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      {titles[severity]}
                    </h2>
                    <ul className="space-y-3">
                      {items.map((n) => {
                        const CatIcon = CATEGORY_ICON[n.category] ?? Bell
                        const isUnread = !n.reviewedAt
                        return (
                          <li
                            key={n.id}
                            className={cn(
                              "rounded-xl border bg-white p-4 shadow-sm",
                              isUnread && "border-l-4 border-l-primary"
                            )}
                          >
                            <div className="flex gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                                <CatIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground">{n.title}</p>
                                <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {format(new Date(n.createdAt), "MMM d, h:mm a")}
                                  {n.createdBy?.name && ` · ${n.createdBy.name}`}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {n.homeId && (
                                    <Button asChild size="sm" variant="outline">
                                      <Link href={getViewHref(n)}>View</Link>
                                    </Button>
                                  )}
                                  {!n.reviewedAt && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleReview(n.id)}
                                      disabled={actioningId === n.id}
                                    >
                                      Mark reviewed
                                    </Button>
                                  )}
                                  {n.requiresAction && !n.resolvedAt && (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => handleResolve(n.id)}
                                      disabled={actioningId === n.id}
                                    >
                                      {actioningId === n.id ? "Resolving…" : "Resolve"}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          )
        ) : activityList.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No notifications in the last 24 hours</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {activityList.map((n) => {
              const config = TYPE_CONFIG[n.type]
              const Icon = config.icon
              return (
                <li key={n.id}>
                  <Link
                    href={`/homes/${n.homeId}`}
                    className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <div className="flex gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 ${config.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{n.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{n.subtitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.userName} · {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                          {" · "}
                          {format(new Date(n.timestamp), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <Navigation />
    </div>
  )
}
