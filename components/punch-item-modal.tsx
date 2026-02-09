"use client"

import { useState, useEffect, useRef } from "react"
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
import { Camera, ImagePlus, X, FileText } from "lucide-react"

interface Contractor {
  id: string
  companyName: string
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

interface PunchItemModalProps {
  taskId: string
  taskName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  editingPunchItem?: PunchItem | null
}

export function PunchItemModal({
  taskId,
  taskName,
  open,
  onOpenChange,
  onSuccess,
  editingPunchItem,
}: PunchItemModalProps) {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [title, setTitle] = useState("")
  const [assignedContractorId, setAssignedContractorId] = useState<string>("")
  const [dueDate, setDueDate] = useState("")
  const [status, setStatus] = useState<PunchStatus>("Open")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!editingPunchItem

  useEffect(() => {
    if (open) {
      // Fetch contractors
      fetch("/api/contractors")
        .then((res) => res.json())
        .then((data) => {
          setContractors(data.filter((c: Contractor) => c.active))
        })
        .catch((err) => console.error("Failed to fetch contractors:", err))

      // If editing, populate form
      if (editingPunchItem) {
        setTitle(editingPunchItem.title)
        setAssignedContractorId(editingPunchItem.assignedContractorId || "")
        setDueDate(
          editingPunchItem.dueDate
            ? new Date(editingPunchItem.dueDate).toISOString().split("T")[0]
            : ""
        )
        setStatus(editingPunchItem.status)
        setSelectedFiles([])
        setFilePreviews([])
      } else {
        // Reset form for new punch item
        setTitle("")
        setAssignedContractorId("")
        setDueDate("")
        setStatus("Open")
        setSelectedFiles([])
        setFilePreviews([])
      }
      setError(null)
    }
  }, [open, editingPunchItem])

  // Revoke object URLs on unmount / modal close
  const previewsRef = useRef<string[]>([])
  previewsRef.current = filePreviews
  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const newFiles = Array.from(files)
    const newPreviews = newFiles.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : ""
    )
    setSelectedFiles((prev) => [...prev, ...newFiles])
    setFilePreviews((prev) => [...prev, ...newPreviews])
    e.target.value = ""
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setFilePreviews((prev) => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!title.trim()) {
        setError("Please enter a punch item description")
        setLoading(false)
        return
      }

      const payload: any = {
        title: title.trim(),
        assignedContractorId: assignedContractorId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      }

      if (isEditing) {
        // Update existing punch item
        payload.status = status
        const res = await fetch(`/api/punch-items/${editingPunchItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to update punch item")
        }
      } else {
        // Create new punch item
        const res = await fetch(`/api/tasks/${taskId}/punch-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to create punch item")
        }
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Punch Item" : "Create Punch Item"}
          </DialogTitle>
          <DialogDescription>
            {taskName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">Description *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded"
              required
              placeholder="Description of the issue"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Assign to Contractor
            </label>
            <select
              value={assignedContractorId}
              onChange={(e) => setAssignedContractorId(e.target.value)}
              className="w-full p-2 border rounded"
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
            <label className="text-sm font-medium mb-1 block">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {!isEditing && (
            <div>
              <label className="text-sm font-medium mb-1 block">
                Photos / files (optional)
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Document the issue with photos or PDFs. On mobile, &quot;Take photo&quot; opens the camera.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-1"
                >
                  <Camera className="h-4 w-4" />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1"
                >
                  <ImagePlus className="h-4 w-4" />
                  Add photos / files
                </Button>
              </div>
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, i) => (
                    <div
                      key={i}
                      className="relative border rounded-lg overflow-hidden bg-muted/50 w-20 h-20 flex items-center justify-center"
                    >
                      {filePreviews[i] ? (
                        <img
                          src={filePreviews[i]}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-0.5 right-0.5 rounded-full bg-destructive text-destructive-foreground p-1 hover:bg-destructive/90"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] truncate px-1">
                        {file.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isEditing && (
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PunchStatus)}
                className="w-full p-2 border rounded"
              >
                <option value="Open">Open</option>
                <option value="ReadyForReview">Ready for Review</option>
                <option value="Closed">Closed</option>
                <option value="Canceled">Canceled</option>
              </select>
            </div>
          )}

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
              {loading ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
