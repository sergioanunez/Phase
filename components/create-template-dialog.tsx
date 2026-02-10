"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface CreateTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateTemplateDialogProps) {
  const [name, setName] = useState("")
  const [defaultDurationDays, setDefaultDurationDays] = useState("")
  const [sortOrder, setSortOrder] = useState("")
  const [optionalCategory, setOptionalCategory] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          defaultDurationDays: parseInt(defaultDurationDays),
          sortOrder: parseInt(sortOrder),
          optionalCategory: optionalCategory || null,
          isDependency: false,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create template item")
      }

      setName("")
      setDefaultDurationDays("")
      setSortOrder("")
      setOptionalCategory("")
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to create template item")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Work Item Template</DialogTitle>
          <DialogDescription>
            Add a new work item to the master template. This will be used when creating new homes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., Foundation, Framing, Roofing"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Default Duration (Days) *
              </label>
              <input
                type="number"
                value={defaultDurationDays}
                onChange={(e) => setDefaultDurationDays(e.target.value)}
                required
                min="1"
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., 7"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Sort Order *
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                required
                min="0"
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., 1, 2, 3"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lower numbers appear first in the schedule
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Category (Optional)
              </label>
              <input
                type="text"
                value={optionalCategory}
                onChange={(e) => setOptionalCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., Structural, Finishing"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
