"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import {
  Calendar,
  MessageSquare,
  CheckCircle,
  XCircle,
  Send,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
  Play,
  Flag,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ActivityEvent = {
  id: string
  source: "activity" | "sms"
  eventType: string
  title: string
  description: string | null
  actorName: string | null
  recipientName: string | null
  createdAt: string
  metadata: Record<string, unknown> | null
}

const EVENT_ICONS: Record<string, React.ElementType> = {
  task_scheduled: Calendar,
  task_rescheduled: Calendar,
  task_cancelled: XCircle,
  task_completed: CheckCircle,
  task_reported_complete: CheckCircle,
  sms_sent: MessageSquare,
  sms_confirmed: CheckCircle,
  sms_declined: XCircle,
  punchlist_sent: ClipboardList,
  punchlist_completed: CheckCircle,
  inspection_passed: CheckCircle,
  inspection_failed: AlertCircle,
  home_started: Play,
  home_completed: Flag,
}

const EVENT_COLORS: Record<string, string> = {
  task_scheduled: "bg-blue-100 text-blue-600",
  task_rescheduled: "bg-amber-100 text-amber-600",
  task_cancelled: "bg-red-100 text-red-600",
  task_completed: "bg-green-100 text-green-600",
  task_reported_complete: "bg-green-100 text-green-600",
  sms_sent: "bg-purple-100 text-purple-600",
  sms_confirmed: "bg-green-100 text-green-600",
  sms_declined: "bg-red-100 text-red-600",
  punchlist_sent: "bg-purple-100 text-purple-600",
  punchlist_completed: "bg-green-100 text-green-600",
  inspection_passed: "bg-green-100 text-green-600",
  inspection_failed: "bg-red-100 text-red-600",
  home_started: "bg-blue-100 text-blue-600",
  home_completed: "bg-green-100 text-green-600",
}

interface HomeActivityTimelineProps {
  homeId: string
  initialLimit?: number
}

export function HomeActivityTimeline({ homeId, initialLimit = 5 }: HomeActivityTimelineProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    fetchActivity()
  }, [homeId, expanded])

  const fetchActivity = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("limit", String(expanded ? 50 : initialLimit))
      if (expanded) params.set("all", "true")

      const res = await fetch(`/api/homes/${homeId}/activity?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
        setHasMore(data.hasMore || false)
      }
    } catch (err) {
      console.error("Failed to fetch activity:", err)
    } finally {
      setLoading(false)
    }
  }

  const getIcon = (eventType: string) => {
    const Icon = EVENT_ICONS[eventType] || Clock
    return Icon
  }

  const getColor = (eventType: string) => {
    return EVENT_COLORS[eventType] || "bg-gray-100 text-gray-600"
  }

  if (loading && events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground mb-1">Activity</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Recent communication and milestone activity for this home.
        </p>
        <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!loading && events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground mb-1">Activity</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Recent communication and milestone activity for this home.
        </p>
        <div className="text-center py-4 text-muted-foreground text-sm">
          No activity recorded yet.
        </div>
      </div>
    )
  }

  const displayedEvents = expanded ? events : events.slice(0, initialLimit)

  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground mb-1">Activity</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Recent communication and milestone activity for this home.
      </p>

      <div className="space-y-3">
        {displayedEvents.map((event, idx) => {
          const Icon = getIcon(event.eventType)
          const colorClass = getColor(event.eventType)

          return (
            <div key={event.id} className="flex gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  colorClass
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground mt-0.5">
                  {event.recipientName && (
                    <span>To {event.recipientName}</span>
                  )}
                  {event.actorName && (
                    <span>By {event.actorName}</span>
                  )}
                  <span>{format(new Date(event.createdAt), "MMM d, h:mm a")}</span>
                </div>
                {event.description && (
                  <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {(hasMore || events.length > initialLimit) && (
        <div className="mt-4 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                View all activity
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
