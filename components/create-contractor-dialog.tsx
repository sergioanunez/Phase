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

interface CreateContractorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CreateContractorDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateContractorDialogProps) {
  const [companyName, setCompanyName] = useState("")
  const [contactName, setContactName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [trade, setTrade] = useState("")
  const [preferredNoticeDays, setPreferredNoticeDays] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName,
          phone,
          email: email || null,
          trade: trade || null,
          preferredNoticeDays: preferredNoticeDays
            ? parseInt(preferredNoticeDays)
            : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create contractor")
      }

      setCompanyName("")
      setContactName("")
      setPhone("")
      setEmail("")
      setTrade("")
      setPreferredNoticeDays("")
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to create contractor")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Contractor</DialogTitle>
          <DialogDescription>
            Add a new contractor to the system
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Company Name *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., ABC Plumbing"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Contact Name *
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                placeholder="+1234567890"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="contact@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Trade (Optional)
              </label>
              <input
                type="text"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., Plumbing, Electrical"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Preferred Notice Days (Optional)
              </label>
              <input
                type="number"
                value={preferredNoticeDays}
                onChange={(e) => setPreferredNoticeDays(e.target.value)}
                min="1"
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., 3"
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
