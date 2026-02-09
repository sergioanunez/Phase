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

interface EditUserDialogUser {
  id: string
  name: string
  email: string
  role: UserRole
  contractorId: string | null
  isActive: boolean
  contractor?: { id: string; companyName: string } | null
}

interface EditUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  user: EditUserDialogUser | null
}

export function EditUserDialog({
  open,
  onOpenChange,
  onSuccess,
  user,
}: EditUserDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("Superintendent")
  const [contractorId, setContractorId] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open && user) {
      setName(user.name)
      setEmail(user.email)
      setPassword("")
      setRole(user.role)
      setContractorId(user.contractorId ?? "")
      setIsActive(user.isActive)
      setError("")
    }
  }, [open, user])

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
    if (!user) return
    setError("")
    setLoading(true)

    try {
      if (role === "Subcontractor" && !contractorId) {
        setError("Subcontractor must be linked to a contractor company")
        setLoading(false)
        return
      }

      const body: {
        name?: string
        email?: string
        password?: string
        role?: UserRole
        contractorId?: string | null
        isActive?: boolean
      } = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        contractorId: role === "Subcontractor" ? (contractorId || null) : null,
        isActive,
      }
      if (password.trim().length >= 6) {
        body.password = password
      }

      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        const msg = typeof data.error === "string"
          ? data.error
          : Array.isArray(data.error)
            ? "Invalid input. Check fields and password (min 6 characters)."
            : "Failed to update user"
        throw new Error(msg)
      }

      setPassword("")
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update user")
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update name, email, role, and status. Leave password blank to keep current.
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
              <label className="block text-sm font-medium mb-1">
                New password (optional, min 6 characters)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Leave blank to keep current"
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
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-user-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="edit-user-active" className="text-sm font-medium">
                Active (user can sign in)
              </label>
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
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
