"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EventRow, type EventRowData } from "./event-row"
import { format } from "date-fns"

export interface DayDetailListProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: Date
  events: EventRowData[]
}

export function DayDetailList({
  open,
  onOpenChange,
  date,
  events,
}: DayDetailListProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border-[#E6E8EF] p-0">
        <DialogHeader className="border-b border-[#E6E8EF] px-4 py-3">
          <DialogTitle className="text-lg font-semibold">
            {format(date, "EEEE, MMMM d")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No events this day
            </p>
          ) : (
            <ul className="space-y-1">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-[#E6E8EF] bg-[#F6F7F9]/50"
                >
                  <EventRow event={ev} showChevron />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
