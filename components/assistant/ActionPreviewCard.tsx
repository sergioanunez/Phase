"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type {
  ScheduleTaskPreview,
  PunchlistPreview,
  MaterialRequestPreview,
} from "@/lib/assistant/types"

type Preview = ScheduleTaskPreview | PunchlistPreview | MaterialRequestPreview

type Props = {
  preview: Preview
  onApprove: () => void
  onCancel: () => void
  loading?: boolean
}

export function ActionPreviewCard({ preview, onApprove, onCancel, loading }: Props) {
  if (preview.type === "schedule_task") {
    const p = preview as ScheduleTaskPreview
    const dateStr = p.scheduledDate
      ? new Date(p.scheduledDate).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : "—"
    return (
      <Card className="border-sky-200 bg-sky-50/50">
        <CardHeader className="pb-2">
          <h4 className="text-sm font-semibold text-sky-800">Schedule task</h4>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <span className="text-muted-foreground">Home</span>
            <span className="font-medium">{p.homeAddress}</span>
            <span className="text-muted-foreground">Task</span>
            <span className="font-medium">{p.taskName}</span>
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{dateStr}</span>
            {p.contractorName && (
              <>
                <span className="text-muted-foreground">Contractor</span>
                <span className="font-medium">{p.contractorName}</span>
              </>
            )}
            <span className="text-muted-foreground">SMS confirmation</span>
            <span className="font-medium">{p.smsConfirmation ? "Yes" : "No"}</span>
          </div>
          {p.validationWarnings && p.validationWarnings.length > 0 && (
            <p className="text-amber-600 text-xs">{p.validationWarnings.join(" ")}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={onApprove} disabled={loading}>
              {loading ? "Executing…" : "Approve"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (preview.type === "create_punchlist") {
    const p = preview as PunchlistPreview
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-2">
          <h4 className="text-sm font-semibold text-amber-800">Create punchlist</h4>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <span className="text-muted-foreground">Home</span>
            <span className="font-medium">{p.homeAddress}</span>
            <span className="text-muted-foreground">Task</span>
            <span className="font-medium">{p.taskName}</span>
            {p.dueDate && (
              <>
                <span className="text-muted-foreground">Due date</span>
                <span className="font-medium">{p.dueDate}</span>
              </>
            )}
            {p.trade && (
              <>
                <span className="text-muted-foreground">Trade</span>
                <span className="font-medium">{p.trade}</span>
              </>
            )}
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Items</span>
            <ul className="mt-1 list-inside list-disc text-foreground">
              {p.items.map((item, i) => (
                <li key={i}>{item.title}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={onApprove} disabled={loading}>
              {loading ? "Creating…" : "Approve"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (preview.type === "create_material_request") {
    const p = preview as MaterialRequestPreview
    return (
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardHeader className="pb-2">
          <h4 className="text-sm font-semibold text-emerald-800">Material request (draft)</h4>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            {p.homeAddress && (
              <>
                <span className="text-muted-foreground">Home</span>
                <span className="font-medium">{p.homeAddress}</span>
              </>
            )}
            <span className="text-muted-foreground">Material</span>
            <span className="font-medium">{p.material}</span>
            <span className="text-muted-foreground">Quantity</span>
            <span className="font-medium">{p.quantity}</span>
            {p.neededBy && (
              <>
                <span className="text-muted-foreground">Needed by</span>
                <span className="font-medium">{p.neededBy}</span>
              </>
            )}
            {p.vendor && (
              <>
                <span className="text-muted-foreground">Vendor</span>
                <span className="font-medium">{p.vendor}</span>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">No purchase order will be submitted.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={onApprove} disabled={loading}>
              {loading ? "Saving…" : "Approve"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
