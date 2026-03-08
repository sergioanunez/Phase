"use client"

import { useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Upload, FileSpreadsheet, Download, Loader2 } from "lucide-react"
import Link from "next/link"

const TEMPLATE_URL = "/templates/contractor-import-template.csv"

export type PreviewRow = {
  companyName: string
  trade: string
  phone: string
  email: string | null
  leadTimeDays: number
  status: "Ready" | "Duplicate" | "Invalid"
  reason: string | null
}

interface ImportContractorsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ImportContractorsDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportContractorsDialogProps) {
  const [step, setStep] = useState<"upload" | "preview" | "success">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [summary, setSummary] = useState({ ready: 0, duplicate: 0, invalid: 0 })
  const [importResult, setImportResult] = useState<{
    added: number
    importBatchId: string
  } | null>(null)
  const [undoing, setUndoing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      const name = selected.name.toLowerCase()
      if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
        setError("Please select an Excel (.xlsx) or CSV file")
        return
      }
      setFile(selected)
      setError("")
      setPreview([])
      setSummary({ ready: 0, duplicate: 0, invalid: 0 })
    }
  }

  const handlePreview = async () => {
    if (!file) {
      setError("Please select a file")
      return
    }
    setLoading(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/admin/contractors/import/preview", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to parse file")
      setPreview(data.preview || [])
      setSummary(data.summary || { ready: 0, duplicate: 0, invalid: 0 })
      setStep("preview")
    } catch (err: any) {
      setError(err.message || "Failed to preview")
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    const readyRows = preview.filter((r) => r.status === "Ready")
    if (readyRows.length === 0) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/contractors/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: readyRows.map((r) => ({
            companyName: r.companyName,
            trade: r.trade,
            phone: r.phone,
            email: r.email,
            leadTimeDays: r.leadTimeDays,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to import")
      setImportResult({ added: data.added, importBatchId: data.importBatchId })
      setStep("success")
      onSuccess()
    } catch (err: any) {
      setError(err.message || "Failed to import")
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async () => {
    if (!importResult?.importBatchId) return
    setUndoing(true)
    setError("")
    try {
      const res = await fetch("/api/admin/contractors/import/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importBatchId: importResult.importBatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to undo")
      onSuccess()
      handleClose()
    } catch (err: any) {
      setError(err.message || "Failed to undo")
    } finally {
      setUndoing(false)
    }
  }

  const handleClose = () => {
    setStep("upload")
    setFile(null)
    setPreview([])
    setSummary({ ready: 0, duplicate: 0, invalid: 0 })
    setImportResult(null)
    setError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
    onOpenChange(false)
  }

  const readyCount = summary.ready

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contractors</DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx) or CSV file to quickly add multiple contractors.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <>
            <div className="space-y-3">
              <a href={TEMPLATE_URL} download="contractor-import-template.csv">
                <Button type="button" variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download template
                </Button>
              </a>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="contractor-import-file"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {file ? file.name : "Choose file"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Required fields: Company Name, Trade, Phone
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePreview}
                disabled={!file || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  "Next: Preview"
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">Summary</p>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                <li>
                  <span className="text-green-600 dark:text-green-400 font-medium">{summary.ready}</span> ready to import
                </li>
                <li>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">{summary.duplicate}</span> duplicates (skipped)
                </li>
                <li>
                  <span className="text-destructive">{summary.invalid}</span> invalid
                </li>
              </ul>
            </div>
            <div className="border rounded-md overflow-auto max-h-[320px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Company Name</th>
                    <th className="text-left p-2 font-medium">Trade</th>
                    <th className="text-left p-2 font-medium">Phone</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Lead Time</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr
                      key={i}
                      className={
                        row.status === "Invalid"
                          ? "bg-destructive/5"
                          : row.status === "Duplicate"
                            ? "bg-amber-50 dark:bg-amber-900/10"
                            : ""
                      }
                    >
                      <td className="p-2">{row.companyName}</td>
                      <td className="p-2">{row.trade}</td>
                      <td className="p-2">{row.phone}</td>
                      <td className="p-2">{row.email ?? "—"}</td>
                      <td className="p-2">{row.leadTimeDays}</td>
                      <td className="p-2">
                        <span
                          className={
                            row.status === "Ready"
                              ? "text-green-600 dark:text-green-400"
                              : row.status === "Duplicate"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-destructive"
                          }
                        >
                          {row.status}
                          {row.reason ? `: ${row.reason}` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={readyCount === 0 || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${readyCount} contractor${readyCount !== 1 ? "s" : ""}`
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && importResult && (
          <>
            <div className="space-y-2">
              <p className="font-medium text-green-600 dark:text-green-400">Import complete</p>
              <ul className="text-sm text-muted-foreground">
                <li>{importResult.added} contractor{importResult.added !== 1 ? "s" : ""} added</li>
                <li>{summary.duplicate} skipped (duplicates)</li>
                <li>{summary.invalid} invalid rows</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Contractors imported successfully. Next step: assign contractors to your work template.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleUndo}
                disabled={undoing}
              >
                {undoing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Undoing...
                  </>
                ) : (
                  "Undo last import"
                )}
              </Button>
              <Link href="/admin?tab=work-templates">
                <Button type="button" variant="outline">
                  Go to Work Items Template
                </Button>
              </Link>
              <Button onClick={handleClose}>View Contractors</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
