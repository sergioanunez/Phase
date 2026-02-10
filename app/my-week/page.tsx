"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Navigation } from "@/components/navigation"
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns"
import { TaskStatus } from "@prisma/client"
import { ClipboardList } from "lucide-react"

interface Task {
  id: string
  nameSnapshot: string
  status: TaskStatus
  scheduledDate: string
  home: {
    id: string
    addressOrLot: string
    subdivision: {
      name: string
    }
  }
  notes: string | null
  punchItems?: Array<{
    id: string
    title: string
    status: string
    severity: string
  }>
}

interface MyWeekData {
  weekStart: string
  weekEnd: string
  tasks: Task[]
  tasksByDay: Record<string, Task[]>
}

export default function MyWeekPage() {
  const [data, setData] = useState<MyWeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [mode, setMode] = useState<"all" | "confirmed" | "pending">("all")
  const [showPending, setShowPending] = useState(false)

  useEffect(() => {
    const weekStartStr = format(currentWeekStart, "yyyy-MM-dd")
    const url = `/api/subcontractor/my-week?weekStart=${weekStartStr}&mode=${mode}`
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setData(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [currentWeekStart, mode])

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case "Completed":
        return "success"
      case "Confirmed":
        return "default"
      case "PendingConfirm":
        return "warning"
      default:
        return "outline"
    }
  }

  const handlePrevWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1))
  }

  const handleNextWeek = () => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1))
  }

  const handleCurrentWeek = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Failed to load schedule</div>
      </div>
    )
  }

  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]

  const filteredTasks = showPending
    ? data.tasks.filter((t) => t.status === "PendingConfirm")
    : data.tasks

  return (
    <div className="min-h-screen bg-gray-100 pb-24 pt-20">
      <div className="app-container">
        <h1 className="text-2xl font-bold mb-6">My Week</h1>

        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button onClick={handlePrevWeek} variant="outline" size="sm">
              ← Prev
            </Button>
            <Button onClick={handleCurrentWeek} variant="outline" size="sm">
              Current Week
            </Button>
            <Button onClick={handleNextWeek} variant="outline" size="sm">
              Next →
            </Button>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            {format(new Date(data.weekStart), "MMM d")} -{" "}
            {format(new Date(data.weekEnd), "MM/dd/yyyy")}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setMode("all")}
              variant={mode === "all" ? "default" : "outline"}
              size="sm"
            >
              All Scheduled
            </Button>
            <Button
              onClick={() => setMode("confirmed")}
              variant={mode === "confirmed" ? "default" : "outline"}
              size="sm"
            >
              Only Confirmed
            </Button>
            <Button
              onClick={() => setShowPending(!showPending)}
              variant={showPending ? "default" : "outline"}
              size="sm"
            >
              Show Pending Confirmations
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {weekDays.map((day, index) => {
            const dayDate = new Date(currentWeekStart)
            dayDate.setDate(dayDate.getDate() + index)
            const dayKey = format(dayDate, "yyyy-MM-dd")
            const dayTasks = filteredTasks.filter(
              (task) => format(new Date(task.scheduledDate), "yyyy-MM-dd") === dayKey
            )

            if (dayTasks.length === 0) return null

            return (
              <div key={day}>
                <h2 className="text-lg font-semibold mb-2">
                  {day} - {format(dayDate, "MMM d")}
                </h2>
                <div className="space-y-3">
                  {dayTasks.map((task) => (
                    <Card key={task.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">
                            {task.nameSnapshot}
                          </CardTitle>
                          <Badge variant={getStatusColor(task.status)}>
                            {task.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm space-y-1">
                          <div>
                            <span className="font-medium">Location: </span>
                            {task.home.subdivision.name} - {task.home.addressOrLot}
                          </div>
                          {task.notes && (
                            <div>
                              <span className="font-medium">Notes: </span>
                              {task.notes}
                            </div>
                          )}
                          {task.punchItems && task.punchItems.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="font-medium text-amber-800 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                                <ClipboardList className="h-3.5 w-3.5" />
                                Punch list ({task.punchItems.length})
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {task.punchItems.map((p) => (
                                  <li
                                    key={p.id}
                                    className="rounded border border-gray-200 bg-gray-50/80 px-2 py-1.5 text-xs"
                                  >
                                    <span className="font-medium">{p.title}</span>
                                    <span className="ml-1.5 text-muted-foreground">
                                      · {p.status} · {p.severity}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {filteredTasks.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No tasks scheduled for this week
          </div>
        )}
      </div>
      <Navigation />
    </div>
  )
}
