"use client"

import { useState, useEffect } from "react"
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
import { Plus, Edit2, Filter, MessageSquare, Check, Trash2, Mail } from "lucide-react"
import {
  buildPunchlistWhatsAppText,
  openWhatsAppShare,
  openEmailShare,
} from "@/lib/share/whatsapp"

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
  photos?: { id: string; imageUrl: string; createdAt?: string }[]
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
  const [punchItems, setPunchItems] = useState<PunchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingSMS, setSendingSMS] = useState(false)
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all")
  const [editingPunchItem, setEditingPunchItem] = useState<PunchItem | null>(null)
  const [punchModalOpen, setPunchModalOpen] = useState(false)

  useEffect(() => {
    if (open) {
      fetchPunchItems()
    }
  }, [open, taskId])

  const fetchPunchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/punch-items`)
      if (res.ok) {
        const data = await res.json()
        setPunchItems(data)
      }
    } catch (err) {
      console.error("Failed to fetch punch items:", err)
    } finally {
      setLoading(false)
    }
  }

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

  const handleMarkComplete = async (itemId: string) => {
    if (!confirm("Mark this punch item as complete?")) {
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Punch Items: {taskName}</DialogTitle>
            <DialogDescription>
              Manage QA items for this task
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-2">
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
              <div className="flex items-center gap-2 flex-nowrap shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={handleShareViaWhatsApp}
                  disabled={punchItems.length === 0 || !homeId}
                  title={
                    punchItems.length === 0 || !homeId
                      ? "No punch items to share"
                      : "Share punch list via WhatsApp"
                  }
                  aria-label="Share punch list via WhatsApp"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
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
                  onClick={handleSendPunchListSMS}
                  disabled={sendingSMS || punchItems.filter(i => i.status === "Open" || i.status === "ReadyForReview").length === 0}
                  title="Send all open punch items to assigned contractors"
                >
                  <MessageSquare className="h-4 w-4 mr-1" />
                  {sendingSMS ? "Sending..." : "Send to Contractors"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingPunchItem(null)
                    setPunchModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Punch
                </Button>
              </div>
            </div>

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
                    className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{item.title}</h4>
                          <Badge variant={getStatusColor(item.status)}>
                            {item.status}
                          </Badge>
                        </div>
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
                      <div className="flex items-center gap-1">
                        {(item.status === "Open" || item.status === "ReadyForReview") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkComplete(item.id)}
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
        open={punchModalOpen}
        onOpenChange={setPunchModalOpen}
        onSuccess={handlePunchSuccess}
        editingPunchItem={editingPunchItem}
      />
    </>
  )
}
