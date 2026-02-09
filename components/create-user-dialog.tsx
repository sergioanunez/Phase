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

type UserRole = "Admin" | "Superintendent" | "Manager" | "Subcontractor"

interface Contractor {
  id: string
  companyName: string
}

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateUserDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("Superintendent")
  const [contractorId, setContractorId] = useState("")
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      fetch("/api/contractors")
        .then((res) => res.json())
        .then((data) => setContractors(Array.isArray(data) ? data : []))
        .catch(() => setContractors([]))
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (role === "Subcontractor" && !contractorId) {
        setError("Subcontractor must be linked to a contractor company")
        setLoading(false)
        return
      }

      if (role === "Subcontractor") {
        const res = await fetch("/api/admin/users/subcontractor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            contractorId: contractorId.trim(),
          }),
        })
        let data: { error?: string; warning?: string } = {}
        try {
          const contentType = res.headers.get("content-type")
          if (contentType?.includes("application/json")) {
            data = await res.json()
          }
        } catch {
          // Server returned non-JSON (e.g. HTML error page)
        }
        if (!res.ok) {
          const msg =
            typeof data.error === "string"
              ? data.error
              : res.status >= 500
                ? "Server error. Please try again."
                : "Failed to invite subcontractor"
          throw new Error(msg)
        }
        if (data.warning) {
          setError(data.warning)
          setLoading(false)
          return
        }
        setName("")
        setEmail("")
        setPassword("")
        setRole("Superintendent")
        setContractorId("")
        onSuccess()
        onOpenChange(false)
        return
      }

      // Superintendent, Manager, Admin: invite flow (email to set password)
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
        }),
      })
      let data: { error?: string; warning?: string } = {}
      try {
        const contentType = res.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          data = await res.json()
        }
      } catch {
        // Server returned non-JSON
      }
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : res.status >= 500
              ? "Server error. Please try again."
              : "Failed to send invite"
        throw new Error(msg)
      }
      if (data.warning) {
        setError(data.warning)
        setLoading(false)
        return
      }
      setName("")
      setEmail("")
      setPassword("")
      setRole("Superintendent")
      setContractorId("")
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invite")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Add a new user (Superintendent, Manager, Admin, or Subcontractor).
            They will receive an email to set their password and activate their account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., jane@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Role *</label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as UserRole)
                  if (e.target.value !== "Subcontractor") setContractorId("")
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="Admin">Admin</option>
                <option value="Superintendent">Superintendent</option>
                <option value="Manager">Manager</option>
                <option value="Subcontractor">Subcontractor</option>
              </select>
            </div>

            {role === "Subcontractor" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Contractor company *
                </label>
                <select
                  value={contractorId}
                  onChange={(e) => setContractorId(e.target.value)}
                  required={role === "Subcontractor"}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Select a contractor</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
                {contractors.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Create contractors in the Contractors tab first.
                  </p>
                )}
              </div>
            )}

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
              {loading ? "Sending invite..." : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
