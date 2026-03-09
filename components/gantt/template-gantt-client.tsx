"use client"

import { useMemo, useCallback, useRef, useEffect } from "react"
import { Gantt, Task, ViewMode } from "gantt-task-react"
import type { Task as GanttTaskType } from "gantt-task-react"
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

function getDurationDays(task: GanttTaskType): number {
  const ms = task.end.getTime() - task.start.getTime()
  if (ms <= 0) return 0
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

type TaskListHeaderProps = {
  headerHeight: number
  rowWidth: string
  fontFamily: string
  fontSize: string
}

function TaskListHeaderCustom({
  headerHeight,
  rowWidth,
  fontFamily,
  fontSize,
}: TaskListHeaderProps) {
  return (
    <div
      className="gantt-custom-header"
      style={{
        fontFamily,
        fontSize,
        display: "table",
        borderBottom: "1px solid var(--border)",
        borderTop: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "table-row",
          height: headerHeight - 2,
        }}
      >
        <div
          className="gantt-custom-header-item"
          style={{
            display: "table-cell",
            verticalAlign: "middle",
            minWidth: rowWidth,
            paddingLeft: "0.5rem",
          }}
        >
          Name
        </div>
        <div
          style={{
            height: headerHeight * 0.5,
            marginTop: headerHeight * 0.2,
            borderRight: "1px solid var(--border)",
            display: "table-cell",
            verticalAlign: "middle",
          }}
        />
        <div
          className="gantt-custom-header-item"
          style={{
            display: "table-cell",
            verticalAlign: "middle",
            minWidth: "5rem",
            paddingLeft: "0.5rem",
          }}
        >
          Duration
        </div>
      </div>
    </div>
  )
}

type TaskListTableProps = {
  rowHeight: number
  rowWidth: string
  fontFamily: string
  fontSize: string
  locale: string
  tasks: GanttTaskType[]
  selectedTaskId: string
  setSelectedTask: (taskId: string) => void
  onExpanderClick: (task: GanttTaskType) => void
}

function TaskListTableCustom({
  rowHeight,
  rowWidth,
  fontFamily,
  fontSize,
  tasks,
  selectedTaskId,
  setSelectedTask,
  onExpanderClick,
}: TaskListTableProps) {
  return (
    <div
      className="gantt-custom-table"
      style={{
        fontFamily,
        fontSize,
        display: "table",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
        width: "100%",
      }}
    >
      {tasks.map((t) => {
        const expanderSymbol =
          t.hideChildren === false ? "▼" : t.hideChildren === true ? "▶" : ""
        const duration = getDurationDays(t)
        return (
          <div
            key={t.id + "row"}
            style={{
              display: "table-row",
              height: rowHeight,
              background: selectedTaskId === t.id ? "hsl(var(--accent))" : undefined,
            }}
          >
            <div
              style={{
                display: "table-cell",
                verticalAlign: "middle",
                minWidth: rowWidth,
                maxWidth: rowWidth,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                paddingLeft: "0.5rem",
              }}
              title={t.name}
            >
              <div style={{ display: "flex" }}>
                <div
                  style={{
                    color: "hsl(var(--muted-foreground))",
                    fontSize: "0.6rem",
                    paddingRight: "0.2rem",
                    cursor: expanderSymbol ? "pointer" : "default",
                  }}
                  onClick={() => expanderSymbol && onExpanderClick(t)}
                  onKeyDown={(e) => {
                    if (expanderSymbol && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault()
                      onExpanderClick(t)
                    }
                  }}
                  role={expanderSymbol ? "button" : undefined}
                  tabIndex={expanderSymbol ? 0 : undefined}
                >
                  {expanderSymbol || "\u00A0"}
                </div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.name}
                </div>
              </div>
            </div>
            <div
              style={{
                display: "table-cell",
                verticalAlign: "middle",
                borderRight: "1px solid var(--border)",
              }}
            />
            <div
              style={{
                display: "table-cell",
                verticalAlign: "middle",
                minWidth: "5rem",
                paddingLeft: "0.5rem",
                whiteSpace: "nowrap",
              }}
            >
              {duration} day{duration !== 1 ? "s" : ""}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TemplateGanttClient({
  tasks,
  links,
  projectStartDate,
  viewMode,
  onTaskSelect,
}: TemplateGanttClientProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
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

  // Timeline: show only month and day numbers (remove "Mon", "Tue", etc.)
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const run = () => {
      const calendar = wrapper.querySelector(".calendar")
      if (!calendar) return
      const texts = calendar.querySelectorAll("text")
      texts.forEach((el) => {
        const text = el.textContent ?? ""
        const match = text.match(/^.+, (\d+)$/)
        if (match) el.textContent = match[1]
      })
    }
    const t = setTimeout(run, 0)
    return () => clearTimeout(t)
  }, [ganttTasks, viewMode, projectStartDate])

  return (
    <div
      ref={wrapperRef}
      className="gantt-wrapper min-h-[400px] [&_.calendar]:!border-border [&_.calendarHeader]:!border-border [&_.listCell]:!border-border [&_.grid]:!border-border"
    >
      <Gantt
        tasks={ganttTasks}
        viewMode={view}
        viewDate={new Date(projectStartDate)}
        listCellWidth="320px"
        columnWidth={viewMode === "Day" ? 56 : viewMode === "Week" ? 56 : 60}
        rowHeight={36}
        barFill={100}
        barCornerRadius={4}
        arrowColor="hsl(var(--primary))"
        todayColor="rgba(0,0,0,0.03)"
        onClick={handleClick}
        onSelect={(_, isSelected) => {
          if (!isSelected) onTaskSelect(null)
        }}
        TaskListHeader={TaskListHeaderCustom}
        TaskListTable={TaskListTableCustom}
      />
    </div>
  )
}
