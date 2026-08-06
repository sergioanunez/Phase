"use client"

import { useState, useEffect, useRef, useCallback, useId } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PunchStatus } from "@prisma/client"
import {
  Camera,
  ImagePlus,
  X,
  FileText,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { useSession } from "next-auth/react"
import { useTransactionEngine } from "@/components/transaction-engine-provider"
import { createClientPunchItemId } from "@/lib/transactions/local-punch-items"
import { playSuccess } from "@/lib/feedback"
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"

interface Contractor {
  id: string
  companyName: string
  active?: boolean
}

interface PunchItem {
  id: string
  title: string
  description: string | null
  assignedContractorId: string | null
  assignedContractor: {
    id: string
    companyName: string
  } | null
  status: PunchStatus
  dueDate: string | null
  createdAt: string
  createdBy: {
    id: string
    name: string
  }
  closedAt: string | null
  closedBy: {
    id: string
    name: string
  } | null
}

type DraftPunchItem = {
  id: string
  title: string
  files: File[]
  previews: string[]
  expanded: boolean
}

export type PunchCreateSuccess = {
  createdCount: number
}

interface PunchItemModalProps {
  taskId: string
  taskName: string
  homeId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (result?: PunchCreateSuccess) => void
  editingPunchItem?: PunchItem | null
}

function newDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function SortableDraftRow({
  item,
  onToggleExpand,
  onDelete,
  onTitleChange,
  onAddFiles,
  onRemoveFile,
  onOpenCamera,
  onOpenLibrary,
}: {
  item: DraftPunchItem
  onToggleExpand: () => void
  onDelete: () => void
  onTitleChange: (title: string) => void
  onAddFiles: (files: FileList | null) => void
  onRemoveFile: (index: number) => void
  onOpenCamera: () => void
  onOpenLibrary: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-border bg-white transition-shadow",
        isDragging && "z-10 shadow-md ring-2 ring-primary/15"
      )}
    >
      <div className="flex items-start gap-1 px-2 py-2">
        <button
          type="button"
          className="mt-0.5 flex h-9 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 py-1.5 text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium leading-snug text-foreground">
              {item.title}
            </span>
            {item.expanded ? (
              <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
          {item.files.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.files.length} Photo{item.files.length === 1 ? "" : "s"}
            </p>
          )}
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
          aria-label={`Remove ${item.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {item.expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <input
              type="text"
              value={item.title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Photos</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenCamera}
                className="h-8"
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                Take Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenLibrary}
                className="h-8"
              >
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                Add Photos
              </Button>
            </div>
            {item.files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.files.map((file, i) => (
                  <div
                    key={`${item.id}-file-${i}`}
                    className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-muted/50"
                  >
                    {item.previews[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previews[i]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveFile(i)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Hidden inputs wired from parent via data attribute targeting */}
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              data-draft-library={item.id}
              onChange={(e) => {
                onAddFiles(e.target.files)
                e.target.value = ""
              }}
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              data-draft-camera={item.id}
              onChange={(e) => {
                onAddFiles(e.target.files)
                e.target.value = ""
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function PunchItemModal({
  taskId,
  taskName,
  homeId,
  open,
  onOpenChange,
  onSuccess,
  editingPunchItem,
}: PunchItemModalProps) {
  const { data: session } = useSession()
  const te = useTransactionEngine()
  const composerId = useId()
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [title, setTitle] = useState("")
  const [assignedContractorId, setAssignedContractorId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [status, setStatus] = useState<PunchStatus>("Open")
  const [draftItems, setDraftItems] = useState<DraftPunchItem[]>([])
  const [composerText, setComposerText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const composerRef = useRef<HTMLInputElement>(null)
  const draftRootRef = useRef<HTMLDivElement>(null)

  const isEditing = !!editingPunchItem
  const useTransactionCreate = te.enabled && te.ready && !isEditing

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const revokeDraftPreviews = useCallback((items: DraftPunchItem[]) => {
    for (const item of items) {
      for (const url of item.previews) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return

    fetch("/api/contractors")
      .then((res) => res.json())
      .then((data) => {
        setContractors(
          Array.isArray(data) ? data.filter((c: Contractor) => c.active !== false) : []
        )
      })
      .catch((err) => console.error("Failed to fetch contractors:", err))

    if (editingPunchItem) {
      setTitle(editingPunchItem.title)
      setAssignedContractorId(editingPunchItem.assignedContractorId || "")
      setDueDate(
        editingPunchItem.dueDate
          ? new Date(editingPunchItem.dueDate).toISOString().split("T")[0]
          : ""
      )
      setStatus(editingPunchItem.status)
      setDraftItems([])
      setComposerText("")
    } else {
      setTitle("")
      setAssignedContractorId("")
      setDueDate("")
      setStatus("Open")
      setDraftItems([])
      setComposerText("")
      requestAnimationFrame(() => composerRef.current?.focus())
    }
    setError(null)
  }, [open, editingPunchItem])

  useEffect(() => {
    return () => {
      revokeDraftPreviews(draftItems)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const focusComposer = () => {
    requestAnimationFrame(() => {
      composerRef.current?.focus({ preventScroll: true })
    })
  }

  const handleAddDraftItem = () => {
    const text = composerText.trim()
    if (!text) {
      setError("Enter an issue description")
      focusComposer()
      return
    }
    setError(null)
    setDraftItems((prev) => [
      ...prev,
      {
        id: newDraftId(),
        title: text,
        files: [],
        previews: [],
        expanded: false,
      },
    ])
    setComposerText("")
    focusComposer()
  }

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddDraftItem()
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraftItems((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  const updateDraft = (id: string, patch: Partial<DraftPunchItem>) => {
    setDraftItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  const deleteDraft = (id: string) => {
    setDraftItems((items) => {
      const target = items.find((i) => i.id === id)
      if (target) {
        target.previews.forEach((url) => {
          if (url) URL.revokeObjectURL(url)
        })
      }
      return items.filter((i) => i.id !== id)
    })
  }

  const addFilesToDraft = (id: string, fileList: FileList | null) => {
    if (!fileList?.length) return
    const newFiles = Array.from(fileList)
    const newPreviews = newFiles.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : ""
    )
    setDraftItems((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              files: [...item.files, ...newFiles],
              previews: [...item.previews, ...newPreviews],
              expanded: true,
            }
          : item
      )
    )
  }

  const removeFileFromDraft = (id: string, index: number) => {
    setDraftItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item
        const url = item.previews[index]
        if (url) URL.revokeObjectURL(url)
        return {
          ...item,
          files: item.files.filter((_, i) => i !== index),
          previews: item.previews.filter((_, i) => i !== index),
        }
      })
    )
  }

  const clickDraftInput = (id: string, kind: "camera" | "library") => {
    const root = draftRootRef.current
    if (!root) return
    const sel =
      kind === "camera"
        ? `[data-draft-camera="${id}"]`
        : `[data-draft-library="${id}"]`
    const input = root.querySelector(sel) as HTMLInputElement | null
    input?.click()
  }

  const createOnePunchItem = async (draft: DraftPunchItem) => {
    const contractor = contractors.find((c) => c.id === assignedContractorId)
    const payload = {
      title: draft.title.trim(),
      assignedContractorId: assignedContractorId || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    }

    const canUseTe = useTransactionCreate && draft.files.length === 0

    if (canUseTe) {
      if (!session?.user?.id || !session.user.companyId) {
        throw new Error("You must be signed in to create a punch item")
      }
      const clientPunchItemId = createClientPunchItemId()
      const deviceCreatedAt = new Date().toISOString()
      await te.dispatch({
        type: "PUNCH_ITEM_CREATE",
        entityId: clientPunchItemId,
        houseId: homeId ?? null,
        payload: {
          clientPunchItemId,
          homeTaskId: taskId,
          homeId: homeId ?? null,
          title: draft.title.trim(),
          description: null,
          assignedContractorId: assignedContractorId || null,
          assignedContractorName: contractor?.companyName ?? null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          deviceCreatedAt,
          source: "punch_list_modal",
        },
      })
      return
    }

    const res = await fetch(`/api/tasks/${taskId}/punch-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        typeof data?.error === "string" ? data.error : "Failed to create punch item"
      )
    }
    const created = (await res.json()) as { id?: string }
    if (draft.files.length > 0 && created.id) {
      const formData = new FormData()
      for (const file of draft.files) {
        formData.append("files", file)
      }
      const upRes = await fetch(`/api/punch-items/${created.id}/photos`, {
        method: "POST",
        body: formData,
      })
      if (!upRes.ok) {
        const data = await upRes.json().catch(() => ({}))
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Punch item was created but photos failed to upload."
        )
      }
    }
  }

  const handleCreateList = async () => {
    setLoading(true)
    setError(null)
    try {
      // Allow flushing the current composer line into the list
      let items = draftItems
      const pending = composerText.trim()
      if (pending) {
        const flushed: DraftPunchItem = {
          id: newDraftId(),
          title: pending,
          files: [],
          previews: [],
          expanded: false,
        }
        items = [...draftItems, flushed]
        setDraftItems(items)
        setComposerText("")
      }

      if (items.length === 0) {
        setError("Add at least one punch item")
        focusComposer()
        setLoading(false)
        return
      }

      if (!assignedContractorId) {
        setError("Select a contractor")
        setLoading(false)
        return
      }

      for (const item of items) {
        if (!item.title.trim()) {
          throw new Error("Every punch item needs a description")
        }
        await createOnePunchItem(item)
      }

      const createdCount = items.length
      revokeDraftPreviews(items)
      setDraftItems([])
      playSuccess()
      onSuccess({ createdCount })
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create punch list")
    } finally {
      setLoading(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPunchItem) return
    setLoading(true)
    setError(null)
    try {
      if (!title.trim()) {
        setError("Please enter a punch item description")
        setLoading(false)
        return
      }
      const payload = {
        title: title.trim(),
        assignedContractorId: assignedContractorId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        status,
      }
      const res = await fetch(`/api/punch-items/${editingPunchItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update punch item")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update")
    } finally {
      setLoading(false)
    }
  }

  // -------- Edit mode UI (single item) --------
  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-[min(28rem,calc(100vw-1rem))] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="break-words pr-6 leading-snug">
              Edit Punch Item
            </DialogTitle>
            <DialogDescription>{taskName}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4">
            {error && (
              <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Description *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border p-2"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Assign to Contractor
              </label>
              <select
                value={assignedContractorId}
                onChange={(e) => setAssignedContractorId(e.target.value)}
                className="w-full rounded border p-2"
              >
                <option value="">Unassigned</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.companyName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded border p-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PunchStatus)}
                className="w-full rounded border p-2"
              >
                <option value="Open">Open</option>
                <option value="ReadyForReview">Ready for Review</option>
                <option value="Closed">Closed</option>
                <option value="Canceled">Canceled</option>
              </select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    )
  }

  // -------- Create Punch List UI --------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-full max-w-[min(28rem,calc(100vw-1rem))] max-h-[92vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 text-left sm:px-5">
          <DialogTitle className="pr-8 text-lg leading-snug">
            Create Punch List
          </DialogTitle>
          <DialogDescription>
            Create multiple punch items for a single contractor.
          </DialogDescription>
          <p className="pt-1 text-xs text-muted-foreground">{taskName}</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Contractor <span className="text-destructive">*</span>
              </label>
              <select
                value={assignedContractorId}
                onChange={(e) => setAssignedContractorId(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Select contractor</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.companyName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">Optional</p>
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <label
              htmlFor={composerId}
              className="block text-sm font-medium"
            >
              Issue description
            </label>
            <div className="flex gap-2">
              <input
                id={composerId}
                ref={composerRef}
                type="text"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                enterKeyHint="done"
                placeholder="Describe issue..."
                className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
                autoComplete="off"
              />
              <Button
                type="button"
                onClick={handleAddDraftItem}
                className="shrink-0 rounded-xl px-3"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Item
              </Button>
            </div>
          </div>

          <div ref={draftRootRef} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Punch Items ({draftItems.length})
              </h3>
            </div>

            {draftItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">No punch items yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add your first issue above.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={draftItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {draftItems.map((item) => (
                      <SortableDraftRow
                        key={item.id}
                        item={item}
                        onToggleExpand={() =>
                          updateDraft(item.id, { expanded: !item.expanded })
                        }
                        onDelete={() => deleteDraft(item.id)}
                        onTitleChange={(t) => updateDraft(item.id, { title: t })}
                        onAddFiles={(files) => addFilesToDraft(item.id, files)}
                        onRemoveFile={(index) => removeFileFromDraft(item.id, index)}
                        onOpenCamera={() => clickDraftInput(item.id, "camera")}
                        onOpenLibrary={() => clickDraftInput(item.id, "library")}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreateList}
            disabled={loading || (draftItems.length === 0 && !composerText.trim())}
          >
            {loading
              ? "Creating..."
              : `Create Punch List${
                  draftItems.length + (composerText.trim() ? 1 : 0) > 0
                    ? ` (${draftItems.length + (composerText.trim() ? 1 : 0)})`
                    : ""
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
