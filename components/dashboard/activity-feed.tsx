"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"

export interface ActivityFeedItem {
  id: string
  action: string
  actionType: string
  userName: string
  houseAddress: string
  subdivision: string
  taskName: string
  timestamp: string
  homeId?: string
  homeLabel?: string
}

export interface ActivityFeedProps {
  activities: ActivityFeedItem[]
  loading?: boolean
}

export function ActivityFeed({ activities, loading }: ActivityFeedProps) {
  const getActionVariant = (
    actionType: string
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (actionType) {
      case "completed":
        return "default"
      case "scheduled":
      case "confirmed":
        return "secondary"
      default:
        return "outline"
    }
  }

  return (
    <Card className="rounded-2xl border-[#E6E8EF] bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-semibold">Live Activity</CardTitle>
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" aria-hidden />
            <span>Live</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading activity…
          </div>
        ) : activities.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <ul className="space-y-2 max-h-[320px] overflow-y-auto">
            {activities.map((activity) => (
              <li key={activity.id}>
                <div className="rounded-xl border border-[#E6E8EF] bg-card p-3 transition-colors hover:bg-muted/30">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant={getActionVariant(activity.actionType)} className="text-xs">
                      {activity.action}
                    </Badge>
                    <span className="text-sm font-medium">{activity.taskName}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{activity.userName}</span>
                    {" · "}
                    {activity.homeId && activity.homeLabel ? (
                      <Link
                        href={`/homes/${activity.homeId}`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {activity.homeLabel}
                      </Link>
                    ) : (
                      <span>{activity.houseAddress}</span>
                    )}
                    {activity.subdivision && (
                      <>
                        {" · "}
                        <span className="text-xs">{activity.subdivision}</span>
                      </>
                    )}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
