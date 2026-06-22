"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FileText, List, AlertCircle } from "lucide-react"
import {
  openWorkTemplatePrintWindow,
  type WorkTemplatePrintCategoryRow,
  type WorkTemplatePrintItem,
  type WorkTemplatePrintMode,
} from "@/lib/work-template-print"

type WorkTemplatePrintDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyName: string
  templateCategoryRows: WorkTemplatePrintCategoryRow[]
  templates: WorkTemplatePrintItem[]
  criticalTemplateIds?: string[]
}

export function WorkTemplatePrintDialog({
  open,
  onOpenChange,
  companyName,
  templateCategoryRows,
  templates,
  criticalTemplateIds,
}: WorkTemplatePrintDialogProps) {
  const isEmpty = templates.length === 0

  const handlePrint = (mode: WorkTemplatePrintMode) => {
    const ok = openWorkTemplatePrintWindow({
      companyName,
      mode,
      templateCategoryRows,
      templates,
      criticalTemplateIds,
    })
    if (!ok) {
      alert("Pop-up blocked. Allow pop-ups for this site to print or save as PDF.")
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print / Export PDF</DialogTitle>
          <DialogDescription>
            Opens a print-friendly view. Use your browser&apos;s print dialog to print or save as PDF.
          </DialogDescription>
        </DialogHeader>

        {isEmpty ? (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <p>No work items in this template yet.</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <button
              type="button"
              onClick={() => handlePrint("compact")}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <List className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Compact Print</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sequence, work item name, duration, and critical flags — ideal for quick review and training.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handlePrint("detailed")}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <FileText className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Detailed Print</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Includes trade, material requirements, lead times, dependencies, sort order, and notes.
                </p>
              </div>
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
