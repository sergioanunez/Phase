"use client"

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

function useSortSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
}

export function WorkTemplateItemSortableRow({
  id,
  disabled,
  handleTitle = "Drag to reorder",
  children,
}: {
  id: string
  disabled?: boolean
  handleTitle?: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-stretch">
      <button
        type="button"
        className="cursor-grab touch-none rounded border border-border bg-muted/40 px-1 py-3 text-muted-foreground hover:bg-muted shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={handleTitle}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function WorkTemplateItemsDndContext({
  itemIds,
  disabled,
  onReorder,
  children,
}: {
  itemIds: string[]
  disabled?: boolean
  onReorder: (nextOrderedIds: string[]) => void | Promise<void>
  children: React.ReactNode
}) {
  const sensors = useSortSensors()
  function handleDragEnd(event: DragEndEvent) {
    if (disabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = itemIds.indexOf(String(active.id))
    const newIndex = itemIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(itemIds, oldIndex, newIndex))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

export function WorkTemplateCategorySortableSection({
  categoryIds,
  disabled,
  onReorder,
  children,
}: {
  categoryIds: string[]
  disabled?: boolean
  onReorder: (nextOrderedIds: string[]) => void | Promise<void>
  children: React.ReactNode
}) {
  const sensors = useSortSensors()
  function handleDragEnd(event: DragEndEvent) {
    if (disabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categoryIds.indexOf(String(active.id))
    const newIndex = categoryIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(categoryIds, oldIndex, newIndex))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

export function WorkTemplateCategorySortableCard({
  id,
  disabled,
  children,
}: {
  id: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        className="absolute left-2 top-3 z-10 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
        aria-label="Drag to reorder category"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="pl-9">{children}</div>
    </div>
  )
}
