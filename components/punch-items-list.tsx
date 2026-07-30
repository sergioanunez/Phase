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
import { Badge } from "@/components/ui/badge"
import { PunchItemModal } from "@/components/punch-item-modal"
import { PunchStatus } from "@prisma/client"
import { format } from "date-fns"
import { Plus, Edit2, MessageSquare, Check, Trash2, Mail, Copy, ExternalLink } from "lucide-react"
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

  const filteredItems = punchItems.filter((item) => {
    if (filter === "open") {
      return item.status === "Open" || item.status === "ReadyForReview"
    }
    if (filter === "closed") {
      return item.status === "Closed" || item.status === "Canceled"
    }
    return true
  })

  const getStatusColor = (status: PunchStatus) => {
    switch (status) {
      case "Open":
        return "destructive"
      case "ReadyForReview":
        return "default"
      case "Closed":
        return "success"
      case "Canceled":
        return "outline"
      default:
        return "outline"
    }
  }

  const handleEdit = (item: PunchItem) => {
    setEditingPunchItem(item)
    setPunchModalOpen(true)
  }

  const handlePunchSuccess = () => {
    fetchPunchItems()
    onUpdate()
    setPunchModalOpen(false)
    setEditingPunchItem(null)
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
                  Add Punch
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
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No punch items found
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-3 sm:p-4 space-y-2 hover:bg-accent/50 transition-colors min-w-0"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                          <h4
                            className={`font-medium break-words ${
                              item.reportedCompleteAt && item.status !== "Closed"
                                ? "line-through text-muted-foreground"
                                : ""
                            }`}
                          >
                            {item.title}
                          </h4>
                          <Badge variant={getStatusColor(item.status)} className="shrink-0">
                            {item.status}
                          </Badge>
                          {item.syncStatus && item.syncStatus !== "synced" && (
                            <Badge
                              variant="outline"
                              className={
                                item.syncStatus === "needs_attention"
                                  ? "shrink-0 border-amber-400 text-amber-900"
                                  : "shrink-0"
                              }
                            >
                              {item.syncStatus === "pending"
                                ? "Waiting to sync"
                                : item.syncStatus === "syncing"
                                  ? "Syncing"
                                  : "Needs attention"}
                            </Badge>
                          )}
                          {item.reportedCompleteAt && item.status !== "Closed" && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-amber-300 bg-amber-50 text-amber-900"
                            >
                              Reported complete
                            </Badge>
                          )}
                        </div>
                        {item.reportedCompleteAt && item.status !== "Closed" && (
                          <p className="text-[11px] text-muted-foreground">
                            Reported by {item.reportedCompleteBy?.name ?? "Subcontractor"} ·{" "}
                            {format(new Date(item.reportedCompleteAt), "MMM d, yyyy h:mm a")}
                            {item.reportedCompleteNote
                              ? ` — “${item.reportedCompleteNote}”`
                              : ""}
                          </p>
                        )}
                        {item.attentionMessage && (
                          <p className="text-xs text-amber-800">{item.attentionMessage}</p>
                        )}
                        {item.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {item.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>
                            Created: {format(new Date(item.createdAt), "MM/dd/yyyy")} by {item.createdBy.name}
                          </span>
                          {item.assignedContractor && (
                            <span>Assigned: {item.assignedContractor.companyName}</span>
                          )}
                          {item.dueDate && (
                            <span>
                              Due: {format(new Date(item.dueDate), "MM/dd/yyyy")}
                            </span>
                          )}
                          {item.closedAt && item.closedBy && (
                            <span>
                              Closed: {format(new Date(item.closedAt), "MM/dd/yyyy")} by {item.closedBy.name}
                            </span>
                          )}
                        </div>
                        {item.photos && item.photos.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.photos.slice(0, 5).map((photo) => (
                              <a
                                key={photo.id}
                                href={photo.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block w-12 h-12 rounded border overflow-hidden bg-muted flex-shrink-0"
                                title="View attachment"
                              >
                                {photo.imageUrl.toLowerCase().endsWith(".pdf") ? (
                                  <span className="w-full h-full flex items-center justify-center text-xs">PDF</span>
                                ) : (
                                  <img src={photo.imageUrl} alt="" className="w-full h-full object-cover" />
                                )}
                              </a>
                            ))}
                            {item.photos.length > 5 && (
                              <span className="text-xs text-muted-foreground self-center">+{item.photos.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 shrink-0 self-end sm:self-start justify-end">
                        {(!item.syncStatus || item.syncStatus === "synced") && (
                          <>
                        {(item.status === "Open" || item.status === "ReadyForReview") &&
                          canTenantVerifyPunch &&
                          item.reportedCompleteAt && (
                            <Button
                              variant="default"
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleMarkComplete(item.id, true)}
                            >
                              Verify & complete
                            </Button>
                          )}
                        {(item.status === "Open" || item.status === "ReadyForReview") &&
                          (!item.reportedCompleteAt || !canTenantVerifyPunch) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkComplete(item.id, false)}
                              className="text-green-600 hover:text-green-700 dark:text-green-400"
                              title="Mark as complete"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          title="Edit punch item"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id, item.title)}
                          className="text-destructive hover:text-destructive"
                          title="Delete punch item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
