"use client"

import { useMemo, useCallback } from "react"
import { Gantt, Task, ViewMode } from "gantt-task-react"
import "gantt-task-react/dist/index.css"

export type GanttTask = {
  id: string
  name: string
  category: string | null
  durationDays: number
  startDate: string
  endDate: string
  dependencyIds: string[]
  isCritical: boolean
  depth: number
}

type TemplateGanttClientProps = {
  tasks: GanttTask[]
  links: Array<{ from: string; to: string }>
  projectStartDate: string
  viewMode: "Day" | "Week" | "Month"
  onTaskSelect: (task: GanttTask | null) => void
}

function toGanttTask(t: GanttTask): Task {
  const start = new Date(t.startDate)
  let end = new Date(t.endDate)
  if (t.durationDays === 0 && end.getTime() === start.getTime()) {
    end = new Date(start)
    end.setDate(end.getDate() + 1)
  }
  return {
    id: t.id,
    name: t.name,
    type: t.durationDays === 0 ? "milestone" : "task",
    start,
    end,
    progress: 0,
    dependencies: t.dependencyIds,
    isDisabled: true,
    styles: t.isCritical
      ? {
          backgroundColor: "hsl(var(--destructive))",
          backgroundSelectedColor: "hsl(var(--destructive))",
          progressColor: "hsl(var(--destructive))",
          progressSelectedColor: "hsl(var(--destructive))",
        }
      : undefined,
  }
}

export function TemplateGanttClient({
  tasks,
  links,
  projectStartDate,
  viewMode,
  onTaskSelect,
}: TemplateGanttClientProps) {
  const ganttTasks = useMemo(() => tasks.map(toGanttTask), [tasks])
  const view =
    viewMode === "Day"
      ? ViewMode.Day
      : viewMode === "Week"
        ? ViewMode.Week
        : ViewMode.Month

  const handleClick = useCallback(
    (task: Task) => {
      const found = tasks.find((t) => t.id === task.id) ?? null
      onTaskSelect(found)
    },
    [tasks, onTaskSelect]
  )

  return (
    <div className="gantt-wrapper gantt-from-to-columns min-h-[400px] [&_.calendar]:!border-border [&_.calendar-header]:!border-border [&_.listCell]:!border-border [&_.grid]:!border-border">
      <style>{`
        .gantt-from-to-columns table th:nth-child(2),
        .gantt-from-to-columns table th:nth-child(3),
        .gantt-from-to-columns table td:nth-child(2),
        .gantt-from-to-columns table td:nth-child(3) {
          min-width: 145px;
        }
      `}</style>
      <Gantt
        tasks={ganttTasks}
        viewMode={view}
        viewDate={new Date(projectStartDate)}
        listCellWidth="320px"
        columnWidth={viewMode === "Day" ? 32 : viewMode === "Week" ? 56 : 60}
        rowHeight={36}
        barFill={100}
        barCornerRadius={4}
        arrowColor="hsl(var(--primary))"
        todayColor="rgba(0,0,0,0.03)"
        onClick={handleClick}
        onSelect={(_, isSelected) => {
          if (!isSelected) onTaskSelect(null)
        }}
      />
    </div>
  )
}
