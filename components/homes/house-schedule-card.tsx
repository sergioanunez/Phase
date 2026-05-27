"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  buildHouseScheduleStrip,
  getHouseScheduleConfirmationLabel,
  type HouseScheduleTaskInput,
} from "@/lib/homes/house-schedule-strip"

type WeekCount = 2 | 4

export type HouseScheduleCardProps = {
  tasks: HouseScheduleTaskInput[]
  onTaskClick?: (task: HouseScheduleTaskInput) => void
}

export function HouseScheduleCard({ tasks, onTaskClick }: HouseScheduleCardProps) {
  const [weekCount, setWeekCount] = useState<WeekCount>(2)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  const strip = useMemo(
    () => buildHouseScheduleStrip(tasks, { weekCount }),
    [tasks, weekCount]
  )

  const selectedDay = strip.days.find((d) => d.dateKey === selectedDateKey) ?? null

  const handleDayActivate = (dateKey: string) => {
    setSelectedDateKey((prev) => (prev === dateKey ? null : dateKey))
  }

  if (!strip.hasAnyScheduled) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="text-base font-semibold text-foreground">House schedule</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Scheduled work for this home</p>
          <p className="mt-4 text-sm text-muted-foreground">No scheduled work yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Schedule the first task to start building the timeline.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">House schedule</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Scheduled work for this home</p>
          </div>
          <div
            className="flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label="Calendar range"
          >
            <Button
              type="button"
              variant={weekCount === 2 ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => {
                setWeekCount(2)
                setSelectedDateKey(null)
              }}
            >
              Next 2 weeks
            </Button>
            <Button
              type="button"
              variant={weekCount === 4 ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => {
                setWeekCount(4)
                setSelectedDateKey(null)
              }}
            >
              Next 4 weeks
            </Button>
          </div>
        </div>

        <div className="mt-4 -mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-min gap-1.5 px-1">
            {strip.days.map((day) => {
              const isSelected = selectedDateKey === day.dateKey
              const showCount = day.scheduledCount > 1

              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => handleDayActivate(day.dateKey)}
                  className={cn(
                    "flex w-[3.25rem] shrink-0 flex-col items-center rounded-lg border px-1 py-2 text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    day.isWeekend && "border-transparent bg-muted/30 opacity-60",
                    !day.isWeekend &&
                      day.scheduledCount === 0 &&
                      !day.isGapDay &&
                      "border-border/60 bg-background",
                    day.isGapDay && !day.isWeekend && "border-amber-200/80 bg-amber-50/50",
                    day.isToday && "ring-2 ring-primary/40 ring-offset-1",
                    isSelected && "border-primary bg-primary/5"
                  )}
                  aria-pressed={isSelected}
                  aria-label={`${day.dayLabel} ${day.dateNumber}, ${day.scheduledCount} scheduled`}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {day.dayLabel}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{day.dateNumber}</span>
                  <div className="mt-1.5 flex h-5 items-center justify-center">
                    {day.isWeekend ? (
                      <span className="text-[10px] text-muted-foreground/70">—</span>
                    ) : day.hasOverdue ? (
                      <span
                        className={cn(
                          "flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white",
                          showCount && "min-w-[1.25rem]"
                        )}
                      >
                        {showCount ? day.scheduledCount : ""}
                      </span>
                    ) : day.allCompleted ? (
                      <span
                        className={cn(
                          "rounded-full bg-emerald-500",
                          showCount
                            ? "flex h-4 min-w-[1rem] items-center justify-center px-1 text-[10px] font-semibold text-white"
                            : "h-2 w-2"
                        )}
                      >
                        {showCount ? day.scheduledCount : null}
                      </span>
                    ) : day.scheduledCount > 0 ? (
                      <span
                        className={cn(
                          "flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white",
                          day.scheduledCount === 1 && "h-2 w-2 p-0"
                        )}
                      >
                        {day.scheduledCount > 1 ? day.scheduledCount : null}
                      </span>
                    ) : day.isGapDay ? (
                      <span className="h-1.5 w-1.5 rounded-full border border-amber-400 bg-amber-100" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">—</span>
                    )}
                  </div>
                  {day.gapLabel && (
                    <span className="mt-0.5 max-w-full truncate text-[9px] font-medium leading-tight text-amber-700">
                      {day.gapLabel}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {selectedDay && (
          <div
            className="mt-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5"
            role="region"
            aria-label={`Tasks on ${selectedDay.dayLabel} ${selectedDay.dateNumber}`}
          >
            <p className="text-xs font-semibold text-foreground">
              {selectedDay.dayLabel} {selectedDay.dateNumber}
              {selectedDay.isToday && (
                <span className="ml-1.5 font-normal text-muted-foreground">(Today)</span>
              )}
            </p>
            {selectedDay.tasks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No work scheduled</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {selectedDay.tasks.map((task) => {
                  const confirm = getHouseScheduleConfirmationLabel(task)
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        disabled={!onTaskClick}
                        onClick={() => onTaskClick?.(task)}
                        className={cn(
                          "w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-left text-sm",
                          onTaskClick && "hover:bg-muted/50"
                        )}
                      >
                        <p className="font-medium text-foreground">{task.nameSnapshot}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {task.contractor?.companyName ?? "No vendor assigned"}
                          {" · "}
                          {task.status === "InProgress" ? "In Progress" : task.status}
                          {confirm ? ` · ${confirm}` : ""}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
