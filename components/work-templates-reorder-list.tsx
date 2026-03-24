"use client"

import { useMemo } from "react"
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
import { GripVertical } from "lucide-react"

export type WorkTemplateReorderRow = {
  id: string
  name: string
  optionalCategory?: string | null
  sequenceOrder?: number | null
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
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
      className="flex items-stretch gap-2 rounded-md border border-border bg-card p-3 shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing shrink-0"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedIds.indexOf(String(active.id))
    const newIndex = orderedIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onOrderedIdsChange(arrayMove(orderedIds, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {orderedIds.map((id) => {
            const t = itemsById.get(id)
            if (!t) return null
            return (
              <SortableRow key={id} id={id}>
                <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{t.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t.optionalCategory || "Uncategorized"}
                  {t.sequenceOrder != null ? ` · order ${t.sequenceOrder}` : ""}
                </div>
              </SortableRow>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
