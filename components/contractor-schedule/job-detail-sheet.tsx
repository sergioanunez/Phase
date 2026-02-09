"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ClipboardList } from "lucide-react"
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border-[#E6E8EF] p-0">
        <DialogHeader className="border-b border-[#E6E8EF] px-4 py-3">
          <DialogTitle className="text-lg font-semibold">{event.title}</DialogTitle>
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
