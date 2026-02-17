"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { ClipboardList, Mail, MessageSquare } from "lucide-react"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { getAppBaseUrl, openWhatsAppShare, openEmailShare, openSMSShare } from "@/lib/share/whatsapp"
import type { ContractorScheduleEvent } from "./job-row"

export interface JobDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: ContractorScheduleEvent | null
}

export function JobDetailSheet({
  open,
  onOpenChange,
  event,
}: JobDetailSheetProps) {
  if (!event) return null

  const buildShareMessage = (): string => {
    const lines: string[] = []

    lines.push(event.title)
    lines.push("")

    lines.push("Address: " + event.address)
    if (event.communityName) {
      lines.push(event.communityName)
    }

    const dateLabel = format(new Date(event.date), "EEEE, MMMM d, yyyy")
    lines.push("Date: " + dateLabel)

    if (event.updatedAt) {
      lines.push(
        "Last updated: " + format(new Date(event.updatedAt), "MMM d, yyyy h:mm a")
      )
    }

    if (event.notes) {
      lines.push("")
      lines.push("Notes:")
      lines.push(event.notes)
    }

    if (event.punchItems && event.punchItems.length > 0) {
      lines.push("")
      lines.push(`Punch list (${event.punchItems.length} item${event.punchItems.length === 1 ? "" : "s"}):`)
      event.punchItems.forEach((p) => {
        const tags = [p.status, p.severity].filter(Boolean).join(" · ")
        lines.push(`• ${p.title}${tags ? " (" + tags + ")" : ""}`)
      })
    }

    if (event.homeId && event.workItemId) {
      const base = getAppBaseUrl()
      if (base) {
        lines.push("")
        lines.push("View in Phase: " + `${base}/homes/${event.homeId}/tasks/${event.workItemId}`)
      }
    }

    return lines.join("\n")
  }

  const handleShareWhatsApp = () => {
    const text = buildShareMessage()
    openWhatsAppShare(text)
    if (typeof window !== "undefined") {
      console.log("share_whatsapp_subcontractor_job", {
        homeId: event.homeId,
        workItemId: event.workItemId,
        punchCount: event.punchItems?.length ?? 0,
      })
    }
  }

  const handleShareSMS = () => {
    const text = buildShareMessage()
    openSMSShare(text)
    if (typeof window !== "undefined") {
      console.log("share_sms_subcontractor_job", {
        homeId: event.homeId,
        workItemId: event.workItemId,
        punchCount: event.punchItems?.length ?? 0,
      })
    }
  }

  const handleShareEmail = () => {
    const text = buildShareMessage()
    openEmailShare(text, event.title)
    if (typeof window !== "undefined") {
      console.log("share_email_subcontractor_job", {
        homeId: event.homeId,
        workItemId: event.workItemId,
        punchCount: event.punchItems?.length ?? 0,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border-[#E6E8EF] p-0">
        <DialogHeader className="border-b border-[#E6E8EF] px-4 py-3 flex flex-row items-center justify-between gap-2">
          <DialogTitle className="text-lg font-semibold">{event.title}</DialogTitle>
          <div className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={handleShareWhatsApp}
              title="Share via WhatsApp"
              aria-label="Share via WhatsApp"
            >
              <WhatsAppIcon className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={handleShareEmail}
              title="Share via email"
              aria-label="Share via email"
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={handleShareSMS}
              title="Send via SMS"
              aria-label="Send via SMS"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Address
            </p>
            <p className="mt-1 text-sm font-medium">{event.address}</p>
            {event.communityName && (
              <p className="text-sm text-muted-foreground">{event.communityName}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Date
            </p>
            <p className="mt-1 text-sm font-medium">
              {format(new Date(event.date), "EEEE, MMMM d, yyyy")}
            </p>
          </div>
          {event.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 text-sm">{event.notes}</p>
            </div>
          )}
          {event.updatedAt && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last updated
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {format(new Date(event.updatedAt), "MMM d, yyyy h:mm a")}
              </p>
            </div>
          )}
          {event.punchItems && event.punchItems.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Punch list ({event.punchItems.length})
              </p>
              <ul className="mt-2 space-y-2">
                {event.punchItems.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-[#E6E8EF] bg-gray-50/80 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground">{p.title}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">
                        {p.status}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {p.severity}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
