"use client"

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import { cn } from "@/lib/utils"

function useHomeSortSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
}

export function SubdivisionHomeSortableRow({
  id,
  showDragHandle,
  children,
}: {
  id: string
  showDragHandle: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !showDragHandle,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-stretch gap-2 rounded-lg",
        isDragging && "relative z-10 scale-[1.02] shadow-lg ring-2 ring-primary/20"
      )}
    >
      {showDragHandle ? (
        <button
          type="button"
          className="mt-3 flex h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md border border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label="Drag to reorder home"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-0 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function SubdivisionHomesSortableList({
  orderedIds,
  onReorder,
  disabled,
  children,
}: {
  orderedIds: string[]
  onReorder: (nextOrderedIds: string[]) => void | Promise<void>
  disabled?: boolean
  children: React.ReactNode
}) {
  const sensors = useHomeSortSensors()

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedIds.indexOf(String(active.id))
    const newIndex = orderedIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(orderedIds, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">{children}</div>
      </SortableContext>
    </DndContext>
  )
}
