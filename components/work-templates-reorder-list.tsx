"use client"

import { useEffect, useMemo } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { logWorkTemplateReorderListValidation } from "@/lib/work-template-display-order"

export type WorkTemplateReorderRow = {
  id: string
  name: string
  optionalCategory?: string | null
}

function SortableRow({
  id,
  index,
  children,
}: {
  id: string
  index: number
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-stretch gap-3 rounded-md border border-border bg-card p-3 shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded px-1.5 text-muted-foreground hover:bg-muted active:cursor-grabbing shrink-0 flex flex-col items-center justify-center gap-0.5"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <span className="text-base leading-none select-none" aria-hidden>
          ≡
        </span>
      </button>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 w-7 shrink-0 tabular-nums text-sm font-medium text-muted-foreground">
          {index + 1}.
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

export function WorkTemplatesReorderList({
  itemsById,
  orderedIds,
  onOrderedIdsChange,
}: {
  itemsById: Map<string, WorkTemplateReorderRow>
  orderedIds: string[]
  onOrderedIdsChange: (ids: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const sortableIds = useMemo(() => orderedIds.filter((id) => itemsById.has(id)), [orderedIds, itemsById])

  useEffect(() => {
    logWorkTemplateReorderListValidation(orderedIds, "list-render")
  }, [orderedIds])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedIds.indexOf(String(active.id))
    const newIndex = orderedIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(orderedIds, oldIndex, newIndex)
    logWorkTemplateReorderListValidation(next, "after-drag")
    onOrderedIdsChange(next)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {orderedIds.map((id, index) => {
            const t = itemsById.get(id)
            if (!t) return null
            const categoryLabel = (t.optionalCategory || "Uncategorized").trim() || "Uncategorized"
            return (
              <SortableRow key={id} id={id} index={index}>
                <div className="font-medium text-foreground break-words">{t.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{categoryLabel}</div>
              </SortableRow>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
