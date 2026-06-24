"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FileText, List, Table, AlertCircle } from "lucide-react"
import {
  printWorkTemplate,
  type WorkTemplatePrintCategoryRow,
  type WorkTemplatePrintItem,
  type WorkTemplatePrintMode,
} from "@/lib/work-template-print"

type WorkTemplatePrintDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyName: string
  companyLogoUrl?: string | null
  templateCategoryRows: WorkTemplatePrintCategoryRow[]
  templates: WorkTemplatePrintItem[]
  criticalTemplateIds?: string[]
}

export function WorkTemplatePrintDialog({
  open,
  onOpenChange,
  companyName,
  companyLogoUrl,
  templateCategoryRows,
  templates,
  criticalTemplateIds,
}: WorkTemplatePrintDialogProps) {
  const isEmpty = templates.length === 0

  const handlePrint = (mode: WorkTemplatePrintMode) => {
    try {
      printWorkTemplate({
        companyName,
        companyLogoUrl,
        mode,
        templateCategoryRows,
        templates,
        criticalTemplateIds,
      })
      onOpenChange(false)
    } catch {
      alert("Could not open the print dialog. Please try again.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print / Export PDF</DialogTitle>
          <DialogDescription>
            Opens your browser&apos;s print dialog so you can print or save as PDF.
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
            <button
              type="button"
              onClick={() => handlePrint("working")}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <Table className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Working Print</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Table worksheet with blank Called, Scheduled, Started, and Finished columns for field
                  use.
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
