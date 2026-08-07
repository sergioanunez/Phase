"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PunchItemModal } from "@/components/punch-item-modal"
import { PunchListGroupCard } from "@/components/punch-list-group-card"
import { PunchStatus } from "@prisma/client"
import { format } from "date-fns"
import { Plus, MessageSquare, Mail, Copy, ExternalLink } from "lucide-react"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import {
  buildPunchlistWhatsAppText,
  openWhatsAppShare,
  openEmailShare,
} from "@/lib/share/whatsapp"
import { useTransactionEngine } from "@/components/transaction-engine-provider"
import {
  listLocalPunchItemsForTask,
  mergePunchLists,
  subscribeLocalPunchItems,
  type LocalPunchSyncStatus,
} from "@/lib/transactions/local-punch-items"
import {
  filterPunchListGroups,
  groupPunchItemsByList,
} from "@/lib/punch/group-punch-lists"
import { createClientPunchItemId } from "@/lib/transactions/local-punch-items"
import { playSuccess } from "@/lib/feedback"

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
  punchListId?: string | null
  punchList?: {
    id: string
    dueDate: string | null
    assignedContractorId: string | null
    assignedContractor: { id: string; companyName: string } | null
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
  reportedCompleteAt?: string | null
  reportedCompleteNote?: string | null
  reportedCompleteBy?: {
    id: string
    name: string
  } | null
  photos?: { id: string; imageUrl: string; createdAt?: string }[]
  syncStatus?: LocalPunchSyncStatus
  clientPunchItemId?: string
  attentionMessage?: string | null
}

interface PunchItemsListProps {
  taskId: string
  taskName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
  /** Required for WhatsApp share deep link */
  homeId?: string
  /** e.g. "Lot 17" or address */
  homeLabel?: string
  /** e.g. "Cullers Homes" (company/subdivision name) */
  contextLabel?: string
}

const TENANT_VERIFY_ROLES = new Set(["Admin", "Manager", "Superintendent"])

export function PunchItemsList({
  taskId,
  taskName,
  open,
  onOpenChange,
  onUpdate,
  homeId,
  homeLabel,
  contextLabel,
}: PunchItemsListProps) {
  const { data: session } = useSession()
  const te = useTransactionEngine()
  const canTenantVerifyPunch = TENANT_VERIFY_ROLES.has(session?.user?.role ?? "")
  const [punchItems, setPunchItems] = useState<PunchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingSMS, setSendingSMS] = useState(false)
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all")
  const [editingPunchItem, setEditingPunchItem] = useState<PunchItem | null>(null)
  const [punchModalOpen, setPunchModalOpen] = useState(false)
  const [publicLink, setPublicLink] = useState<string | null>(null)
  const [publicLinkSentAt, setPublicLinkSentAt] = useState<string | null>(null)
  const [createBanner, setCreateBanner] = useState<string | null>(null)
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [editListId, setEditListId] = useState<string | null>(null)
  const [editListContractorId, setEditListContractorId] = useState("")
  const [editListDueDate, setEditListDueDate] = useState("")
  const [editListSaving, setEditListSaving] = useState(false)
  const [editListItemCount, setEditListItemCount] = useState(0)
  const [editListOriginalContractorId, setEditListOriginalContractorId] = useState<string | null>(
    null
  )

  const fetchPunchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/punch-items`)
      const serverItems: PunchItem[] = res.ok ? await res.json() : []

      let merged = serverItems
      if (
        te.enabled &&
        session?.user?.companyId &&
        session.user.id
      ) {
        const locals = await listLocalPunchItemsForTask({
          tenantId: session.user.companyId,
          userId: session.user.id,
          homeTaskId: taskId,
        })
        merged = mergePunchLists({
          serverItems,
          localItems: locals,
          mapLocal: (local) => ({
            id: local.serverPunchItemId ?? local.clientPunchItemId,
            title: local.title,
            description: local.description,
            assignedContractorId: local.assignedContractorId,
            assignedContractor: local.assignedContractorName
              ? { id: local.assignedContractorId ?? "", companyName: local.assignedContractorName }
              : null,
            status: (local.status as PunchStatus) || "Open",
            dueDate: local.dueDate,
            createdAt: local.deviceCreatedAt,
            createdBy: {
              id: session.user!.id,
              name: session.user!.name ?? "You",
            },
            closedAt: null,
            closedBy: null,
            syncStatus: local.syncStatus,
            clientPunchItemId: local.clientPunchItemId,
            attentionMessage: local.attentionMessage,
          }),
        })
      }

      setPunchItems(merged)
    } catch (err) {
      console.error("Failed to fetch punch items:", err)
    } finally {
      setLoading(false)
    }
  }, [taskId, te.enabled, session?.user?.companyId, session?.user?.id, session?.user?.name])

  useEffect(() => {
    if (open) {
      fetchPunchItems()
      fetch(`/api/tasks/${taskId}/punch-items/public-link`, { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.publicLink) {
            setPublicLink(data.publicLink)
            setPublicLinkSentAt(data.sentAt ?? null)
          }
        })
        .catch(() => {})
    }
  }, [open, taskId, fetchPunchItems])

  useEffect(() => {
    if (!te.enabled || !open) return
    return subscribeLocalPunchItems(() => {
      void fetchPunchItems()
    })
  }, [te.enabled, open, fetchPunchItems])

  useEffect(() => {
    if (!te.enabled || !open) return
    const unsub = te.engine?.subscribe(() => {
      void fetchPunchItems()
    })
    return () => unsub?.()
  }, [te.enabled, te.engine, open, fetchPunchItems])

  useEffect(() => {
    if (!open) return
    fetch("/api/contractors", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) =>
        setContractors(
          Array.isArray(data)
            ? data.filter((c: Contractor & { active?: boolean }) => c.active !== false)
            : []
        )
      )
      .catch(() => setContractors([]))
  }, [open])

  const filteredGroups = filterPunchListGroups(
    groupPunchItemsByList(punchItems as never),
    filter
  )

  const handleEdit = (item: PunchItem) => {
    setEditingPunchItem(item)
    setPunchModalOpen(true)
  }

  const handlePunchSuccess = (result?: { createdCount: number }) => {
    fetchPunchItems()
    onUpdate()
    setPunchModalOpen(false)
    setEditingPunchItem(null)
    if (result?.createdCount && result.createdCount > 0) {
      const n = result.createdCount
      setCreateBanner(
        n === 1 ? "Created 1 punch item." : `Created ${n} punch items.`
      )
      window.setTimeout(() => setCreateBanner(null), 3500)
    }
  }

  const handleAddItemToList = async (
    listId: string,
    title: string,
    files: File[]
  ) => {
    const clientPunchItemId = createClientPunchItemId()
    const res = await fetch(`/api/punch-lists/${listId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, clientPunchItemId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        typeof data?.error === "string" ? data.error : "Failed to add item"
      )
    }
    const created = (await res.json()) as { id?: string }
    if (files.length > 0 && created.id) {
      const formData = new FormData()
      for (const file of files) formData.append("files", file)
      const up = await fetch(`/api/punch-items/${created.id}/photos`, {
        method: "POST",
        body: formData,
      })
      if (!up.ok) {
        throw new Error("Item added but photos failed to upload")
      }
    }
    playSuccess()
    await fetchPunchItems()
    onUpdate()
  }

  const openEditList = (group: {
    id: string
    kind: "list" | "legacy"
    assignedContractorId: string | null
    dueDate: string | null
    totalCount: number
  }) => {
    if (group.kind !== "list") return
    setEditListId(group.id)
    setEditListContractorId(group.assignedContractorId ?? "")
    setEditListOriginalContractorId(group.assignedContractorId)
    setEditListDueDate(
      group.dueDate ? new Date(group.dueDate).toISOString().slice(0, 10) : ""
    )
    setEditListItemCount(group.totalCount)
  }

  const saveEditList = async () => {
    if (!editListId) return
    if (
      editListContractorId &&
      editListOriginalContractorId &&
      editListContractorId !== editListOriginalContractorId &&
      editListItemCount > 0
    ) {
      const name =
        contractors.find((c) => c.id === editListContractorId)?.companyName ??
        "this contractor"
      if (
        !confirm(
          `Move all ${editListItemCount} item${editListItemCount === 1 ? "" : "s"} to ${name}?`
        )
      ) {
        return
      }
    }
    setEditListSaving(true)
    try {
      const res = await fetch(`/api/punch-lists/${editListId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedContractorId: editListContractorId || undefined,
          dueDate: editListDueDate
            ? new Date(editListDueDate).toISOString()
            : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data?.error === "string" ? data.error : "Failed to update list"
        )
      }
      setEditListId(null)
      await fetchPunchItems()
      onUpdate()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update list")
    } finally {
      setEditListSaving(false)
    }
  }

  const handleShareViaWhatsApp = () => {
    if (punchItems.length === 0 || !homeId) return
    const dueDates = punchItems
      .map((i) => i.dueDate)
      .filter((d): d is string => d != null)
    const dueDate =
      dueDates.length > 0
        ? dueDates.reduce((a, b) => (a > b ? a : b))
        : undefined
    const text = buildPunchlistWhatsAppText({
      contextLabel: contextLabel ?? undefined,
      homeLabel: homeLabel ?? undefined,
      taskName,
      punchItems: punchItems.map((i) => ({ title: i.title })),
      dueDate: dueDate ?? undefined,
      homeId,
    })
    openWhatsAppShare(text)
    if (typeof window !== "undefined") {
      console.log("share_whatsapp_punchlist", { homeId, itemCount: punchItems.length })
    }
  }

  const handleShareViaEmail = () => {
    if (punchItems.length === 0 || !homeId) return
    const dueDates = punchItems
      .map((i) => i.dueDate)
      .filter((d): d is string => d != null)
    const dueDate =
      dueDates.length > 0
        ? dueDates.reduce((a, b) => (a > b ? a : b))
        : undefined
    const text = buildPunchlistWhatsAppText({
      contextLabel: contextLabel ?? undefined,
      homeLabel: homeLabel ?? undefined,
      taskName,
      punchItems: punchItems.map((i) => ({ title: i.title })),
      dueDate: dueDate ?? undefined,
      homeId,
    })
    const subject = [contextLabel, homeLabel].filter(Boolean).join(" – ") + " – Punch List"
    openEmailShare(text, subject)
    if (typeof window !== "undefined") {
      console.log("share_email_punchlist", { homeId, itemCount: punchItems.length })
    }
  }

  const handleSendPunchListSMS = async () => {
    const openItems = punchItems.filter(
      (item) => item.status === "Open" || item.status === "ReadyForReview"
    )

    if (openItems.length === 0) {
      alert("No open punch items to send")
      return
    }

    if (
      !confirm(
        `Send ${openItems.length} punch item(s) to assigned contractors?`
      )
    ) {
      return
    }

    setSendingSMS(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/punch-items/send-sms`, {
        method: "POST",
      })

      const data = await res.json()

      if (res.ok) {
        if (data.publicLink) {
          setPublicLink(data.publicLink)
          setPublicLinkSentAt(new Date().toISOString())
        }
        if (data.errors && data.errors.length > 0) {
          const errorMessages = data.errors
            .map((e: any) => `${e.contractor}: ${e.error}`)
            .join("\n")
          const successMessages = data.results
            .map((r: any) => `✓ ${r.contractor}: ${r.itemsCount} item(s) sent`)
            .join("\n")
          alert(
            `SMS Results:\n\n${successMessages}\n\nErrors:\n${errorMessages}`
          )
        } else {
          const successMessages = data.results
            .map((r: any) => `✓ ${r.contractor}: ${r.itemsCount} item(s) sent`)
            .join("\n")
          alert(`SMS sent successfully:\n\n${successMessages}`)
        }
      } else {
        alert(data.error || "Failed to send punch list SMS")
      }
    } catch (err: any) {
      console.error("Failed to send punch list SMS:", err)
      alert("Failed to send punch list SMS")
    } finally {
      setSendingSMS(false)
    }
  }

  const handleMarkComplete = async (itemId: string, verifyReport?: boolean) => {
    const msg = verifyReport
      ? "Verify the subcontractor report and close this punch item?"
      : "Mark this punch item as complete?"
    if (!confirm(msg)) {
      return
    }

    try {
      const res = await fetch(`/api/punch-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Closed" }),
      })

      if (res.ok) {
        fetchPunchItems()
        onUpdate()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to mark punch item as complete")
      }
    } catch (err: any) {
      console.error("Failed to mark punch item as complete:", err)
      alert("Failed to mark punch item as complete")
    }
  }

  const handleDelete = async (itemId: string, itemTitle: string) => {
    if (!confirm(`Delete punch item "${itemTitle}"? This cannot be undone.`)) {
      return
    }

    try {
      const res = await fetch(`/api/punch-items/${itemId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        fetchPunchItems()
        onUpdate()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to delete punch item")
      }
    } catch (err: any) {
      console.error("Failed to delete punch item:", err)
      alert("Failed to delete punch item")
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-[min(42rem,calc(100vw-1rem))] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader className="text-left sm:text-left">
            <DialogTitle className="break-words pr-6 leading-snug">
              Punch Items: {taskName}
            </DialogTitle>
            <DialogDescription>
              Manage QA items for this task
            </DialogDescription>
          </DialogHeader>

          {createBanner && (
            <div
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
              role="status"
            >
              {createBanner}
            </div>
          )}

          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("all")}
                >
                  All
                </Button>
                <Button
                  variant={filter === "open" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("open")}
                >
                  Open
                </Button>
                <Button
                  variant={filter === "closed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("closed")}
                >
                  Closed
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={handleShareViaWhatsApp}
                  disabled={punchItems.length === 0 || !homeId}
                  title={
                    punchItems.length === 0 || !homeId
                      ? "No punch items to share"
                      : "Share via WhatsApp"
                  }
                  aria-label="Share via WhatsApp"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0"
                  onClick={handleShareViaEmail}
                  disabled={punchItems.length === 0 || !homeId}
                  title={
                    punchItems.length === 0 || !homeId
                      ? "No punch items to share"
                      : "Share punch list via email"
                  }
                  aria-label="Share punch list via email"
                >
                  <Mail className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0"
                  onClick={handleSendPunchListSMS}
                  disabled={sendingSMS || punchItems.filter(i => i.status === "Open" || i.status === "ReadyForReview").length === 0}
                  title={sendingSMS ? "Sending..." : "Send via SMS"}
                  aria-label={sendingSMS ? "Sending..." : "Send via SMS"}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setEditingPunchItem(null)
                    setPunchModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-1 shrink-0" />
                  Add Punch List
                </Button>
              </div>
            </div>

            {publicLink && punchItems.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
                <p className="font-medium text-muted-foreground">Public link</p>
                <p className="mt-1 truncate text-xs text-muted-foreground" title={publicLink}>
                  {publicLink}
                </p>
                {publicLinkSentAt && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sent {format(new Date(publicLinkSentAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(publicLink)
                      alert("Link copied to clipboard")
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy link
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={publicLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open public view
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No punch items found
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-white px-3">
                {filteredGroups.map((group) => (
                  <PunchListGroupCard
                    key={group.id}
                    group={group}
                    canTenantVerifyPunch={canTenantVerifyPunch}
                    onEditItem={(item) => {
                      const full = punchItems.find((p) => p.id === item.id)
                      if (full) handleEdit(full)
                    }}
                    onDeleteItem={handleDelete}
                    onCompleteItem={handleMarkComplete}
                    onAddItem={handleAddItemToList}
                    onEditList={openEditList}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editListId && (
        <Dialog open={!!editListId} onOpenChange={(o) => !o && setEditListId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Punch List</DialogTitle>
              <DialogDescription>
                Changes apply to every item on this list.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Contractor</label>
                <select
                  value={editListContractorId}
                  onChange={(e) => setEditListContractorId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                >
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Due Date</label>
                <input
                  type="date"
                  value={editListDueDate}
                  onChange={(e) => setEditListDueDate(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditListId(null)}
                  disabled={editListSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveEditList()}
                  disabled={editListSaving || !editListContractorId}
                >
                  {editListSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <PunchItemModal
        taskId={taskId}
        taskName={taskName}
        homeId={homeId}
        open={punchModalOpen}
        onOpenChange={setPunchModalOpen}
        onSuccess={handlePunchSuccess}
        editingPunchItem={editingPunchItem}
      />
    </>
  )
}
