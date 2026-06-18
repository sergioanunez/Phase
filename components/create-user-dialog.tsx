"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { InviteDeliveryMethodInput } from "@/lib/invite-delivery"
import {
  InviteDeliveryFields,
  defaultInviteDeliveryForRole,
} from "@/components/invites/invite-delivery-fields"

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
  const [phone, setPhone] = useState("")
  const [inviteDeliveryMethod, setInviteDeliveryMethod] =
    useState<InviteDeliveryMethodInput>("email")
  const [role, setRole] = useState<UserRole>("Superintendent")
  const [contractorId, setContractorId] = useState("")
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetch("/api/contractors")
        .then((res) => res.json())
        .then((data) => setContractors(Array.isArray(data) ? data : []))
        .catch(() => setContractors([]))
    }
  }, [open])

  useEffect(() => {
    setInviteDeliveryMethod(defaultInviteDeliveryForRole(role, ""))
  }, [role])

  const resetForm = () => {
    setName("")
    setEmail("")
    setPhone("")
    setInviteDeliveryMethod("email")
    setRole("Superintendent")
    setContractorId("")
    setError("")
    setUpgradeHint(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setUpgradeHint(null)
    setLoading(true)

    const payload = {
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      inviteDeliveryMethod,
    }

    try {
      if (role === "Subcontractor" && !contractorId) {
        setError("Contact must be linked to a vendor")
        setLoading(false)
        return
      }

      const endpoint =
        role === "Subcontractor"
          ? "/api/admin/users/subcontractor"
          : "/api/admin/users/invite"

      const body =
        role === "Subcontractor"
          ? { ...payload, contractorId: contractorId.trim() }
          : { ...payload, role }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      let data: { error?: string; warning?: string; upgradeHint?: string } = {}
      try {
        const contentType = res.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          data = await res.json()
        }
      } catch {
        // Server returned non-JSON
      }

      if (!res.ok) {
        setUpgradeHint(data.upgradeHint ?? null)
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

      resetForm()
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invite")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) resetForm()
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Invite a new user by email, SMS, or both. Contacts are people linked to a vendor who
            receive scheduling texts after they accept and opt in.
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

            <InviteDeliveryFields
              email={email}
              phone={phone}
              inviteDeliveryMethod={inviteDeliveryMethod}
              onEmailChange={setEmail}
              onPhoneChange={setPhone}
              onDeliveryMethodChange={setInviteDeliveryMethod}
              isContactRole={role === "Subcontractor"}
            />

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
                <option value="Subcontractor">Contact (subcontractor)</option>
              </select>
            </div>

            {role === "Subcontractor" && (
              <div>
                <label className="block text-sm font-medium mb-1">Vendor (company) *</label>
                <select
                  value={contractorId}
                  onChange={(e) => setContractorId(e.target.value)}
                  required={role === "Subcontractor"}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Select a vendor</option>
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
              <div className="text-sm text-destructive">
                {error}
                {upgradeHint && (
                  <span className="block mt-1">
                    <Link
                      href={upgradeHint}
                      className="underline text-primary"
                      onClick={() => onOpenChange(false)}
                    >
                      Go to Billing
                    </Link>
                  </span>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
