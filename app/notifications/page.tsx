"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bell, ChevronLeft, ClipboardList, Calendar, Check, XCircle, RefreshCw } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { format, formatDistanceToNow } from "date-fns"
import type { NotificationItem } from "@/app/api/notifications/route"

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

export default function NotificationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
      return
    }
    if (status !== "authenticated") return
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((data) => {
        setNotifications(data.notifications ?? [])
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false))
  }, [status, router])

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-24 pt-20">
      <div className="app-container px-4">
        <header className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </header>

        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Events on your assigned homes (last 24 hours). Tasks scheduled, confirmed, completed, cancelled, rescheduled, and punch items added.
        </p>

        {loading ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No notifications in the last 24 hours</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {notifications.map((n) => {
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
