"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import {
  Check,
  Edit2,
  MoreHorizontal,
  Plus,
  Trash2,
  Camera,
  ImagePlus,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PunchListGroup } from "@/lib/punch/group-punch-lists"
import { PunchStatus } from "@prisma/client"
import { cn } from "@/lib/utils"

type PunchItemRow = PunchListGroup["items"][number]

function statusBadgeVariant(status: string) {
  switch (status as PunchStatus) {
    case "Open":
      return "destructive" as const
    case "ReadyForReview":
      return "default" as const
    case "Closed":
      return "success" as const
    default:
      return "outline" as const
  }
}

export function PunchListGroupCard({
  group,
  canTenantVerifyPunch,
  onEditItem,
  onDeleteItem,
  onCompleteItem,
  onAddItem,
  onEditList,
}: {
  group: PunchListGroup
  canTenantVerifyPunch: boolean
  onEditItem: (item: PunchItemRow) => void
  onDeleteItem: (id: string, title: string) => void
  onCompleteItem: (id: string, verifyReport?: boolean) => void
  onAddItem: (
    listId: string,
    title: string,
    files: File[]
  ) => Promise<void>
  onEditList: (group: PunchListGroup) => void
}) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerText, setComposerText] = useState("")
  const [composerFiles, setComposerFiles] = useState<File[]>([])
  const [composerPreviews, setComposerPreviews] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (composerOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [composerOpen])

  useEffect(() => {
    return () => {
      composerPreviews.forEach((u) => u && URL.revokeObjectURL(u))
    }
  }, [composerPreviews])

  const openCount = group.openCount
  const total = group.totalCount
  const completed = Math.max(0, total - openCount)
  const summary =
    openCount > 0
      ? `${openCount} open${group.dueDate ? ` · Due ${format(new Date(group.dueDate), "MMM d")}` : ""}`
      : total > 0
        ? `${completed} of ${total} complete`
        : "No items"

  const handleAddFiles = (list: FileList | null) => {
    if (!list?.length) return
    const files = Array.from(list)
    const previews = files.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : ""
    )
    setComposerFiles((p) => [...p, ...files])
    setComposerPreviews((p) => [...p, ...previews])
  }

  const submitAdd = async () => {
    const title = composerText.trim()
    if (!title) {
      setAddError("Enter an issue description")
      inputRef.current?.focus()
      return
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setAddError("Adding items requires a connection right now.")
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      await onAddItem(group.id, title, composerFiles)
      composerPreviews.forEach((u) => u && URL.revokeObjectURL(u))
      setComposerText("")
      setComposerFiles([])
      setComposerPreviews([])
      requestAnimationFrame(() => inputRef.current?.focus())
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add item")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="min-w-0 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-2 px-1 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            {group.contractorName}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
        </div>
        {group.kind === "list" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            onClick={() => onEditList(group)}
            title="Edit punch list"
            aria-label="Edit punch list"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border/70">
        {group.items.map((item) => {
          const reported =
            !!item.reportedCompleteAt && item.status !== "Closed"
          return (
            <li
              key={item.id}
              className="flex items-start gap-2 py-2.5 pl-1 pr-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm leading-snug",
                      reported || item.status === "Closed"
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    )}
                  >
                    {item.title}
                  </span>
                  <Badge
                    variant={statusBadgeVariant(item.status)}
                    className="h-5 shrink-0 px-1.5 text-[10px]"
                  >
                    {item.status}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {(item.status === "Open" || item.status === "ReadyForReview") &&
                  canTenantVerifyPunch &&
                  reported && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-green-600"
                      onClick={() => onCompleteItem(item.id, true)}
                      title="Verify & complete"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                {(item.status === "Open" || item.status === "ReadyForReview") &&
                  (!reported || !canTenantVerifyPunch) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-green-600"
                      onClick={() => onCompleteItem(item.id, false)}
                      title="Mark as complete"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onEditItem(item)}
                  title="Edit"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive"
                  onClick={() => onDeleteItem(item.id, item.title)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {group.kind === "list" && (
        <div className="pb-3 pt-1">
          {!composerOpen ? (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-medium text-primary hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Add to {group.contractorName}
              </p>
              {addError && (
                <p className="text-xs text-destructive">{addError}</p>
              )}
              <input
                ref={inputRef}
                type="text"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void submitAdd()
                  }
                }}
                placeholder="Describe issue..."
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                enterKeyHint="done"
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="mr-1 h-3.5 w-3.5" />
                  Take Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="mr-1 h-3.5 w-3.5" />
                  Add Photos
                </Button>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    handleAddFiles(e.target.files)
                    e.target.value = ""
                  }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleAddFiles(e.target.files)
                    e.target.value = ""
                  }}
                />
              </div>
              {composerFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {composerFiles.length} photo
                  {composerFiles.length === 1 ? "" : "s"} attached
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void submitAdd()}
                  disabled={adding}
                >
                  {adding ? "Adding..." : "Add Item"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setComposerOpen(false)
                    setComposerText("")
                    setAddError(null)
                  }}
                  disabled={adding}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
