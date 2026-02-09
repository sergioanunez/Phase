"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface Subdivision {
  id: string
  name: string
}

interface CreateHomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  refreshSubdivisions?: number
  preselectedSubdivisionId?: string
}

export function CreateHomeDialog({
  open,
  onOpenChange,
  onSuccess,
  refreshSubdivisions,
  preselectedSubdivisionId,
}: CreateHomeDialogProps) {
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([])
  const [subdivisionId, setSubdivisionId] = useState("")
  const [addressOrLot, setAddressOrLot] = useState("")
  const [startDate, setStartDate] = useState("")
  const [targetCompletionDate, setTargetCompletionDate] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const fetchSubdivisions = () => {
    fetch("/api/subdivisions")
      .then((res) => res.json())
      .then((data) => {
        setSubdivisions(data)
        // Auto-select preselected subdivision, or first subdivision if none selected
        if (data.length > 0) {
          if (preselectedSubdivisionId && data.find((s: Subdivision) => s.id === preselectedSubdivisionId)) {
            setSubdivisionId(preselectedSubdivisionId)
          } else if (!subdivisionId || !data.find((s: Subdivision) => s.id === subdivisionId)) {
            setSubdivisionId(data[0].id)
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch subdivisions:", err)
      })
  }

  useEffect(() => {
    if (open) {
      fetchSubdivisions()
    }
  }, [open, refreshSubdivisions, preselectedSubdivisionId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/homes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subdivisionId,
          addressOrLot,
          startDate: startDate || null,
          targetCompletionDate: targetCompletionDate || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create home")
      }

      setSubdivisionId("")
      setAddressOrLot("")
      setStartDate("")
      setTargetCompletionDate("")
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to create home")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Home</DialogTitle>
          <DialogDescription>
            Add a new home to the system. Tasks will be automatically generated from the template.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">
                  Subdivision *
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fetchSubdivisions}
                  className="h-6 text-xs"
                >
                  Refresh
                </Button>
              </div>
              <select
                value={subdivisionId}
                onChange={(e) => setSubdivisionId(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Select subdivision</option>
                {subdivisions.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
              {subdivisions.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No subdivisions found. Create one first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Address or Lot Number *
              </label>
              <input
                type="text"
                value={addressOrLot}
                onChange={(e) => setAddressOrLot(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., 123 Oakwood Drive"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Start Date (Optional)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Target Completion Date (Optional)
              </label>
              <input
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
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
            <Button type="submit" disabled={loading || !subdivisionId}>
              {loading ? "Creating..." : "Create Home"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
