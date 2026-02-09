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
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react"

interface ImportHomesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  subdivisionId: string
  subdivisionName: string
}

export function ImportHomesDialog({
  open,
  onOpenChange,
  onSuccess,
  subdivisionId,
  subdivisionName,
}: ImportHomesDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{
    imported: number
    errors: string[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (
        !selectedFile.name.endsWith(".xlsx") &&
        !selectedFile.name.endsWith(".xls")
      ) {
        setError("Please select an Excel file (.xlsx or .xls)")
        return
      }
      setFile(selectedFile)
      setError("")
      setResult(null)
    }
  }

  const handleImport = async () => {
    if (!file) {
      setError("Please select a file")
      return
    }

    setLoading(true)
    setError("")
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("subdivisionId", subdivisionId)

      const res = await fetch("/api/homes/import", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to import homes")
      }

      setResult({
        imported: data.imported,
        errors: data.errors || [],
      })

      if (data.imported > 0) {
        // Wait a bit then refresh and close
        setTimeout(() => {
          onSuccess()
          handleReset()
          onOpenChange(false)
        }, 2000)
      }
    } catch (err: any) {
      setError(err.message || "Failed to import homes")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setError("")
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import Homes</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx or .xls) to import homes into{" "}
            <strong>{subdivisionName}</strong>. Columns: Address/Lot, Target
            Completion Date (optional)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Excel File
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload-homes"
              />
              <label
                htmlFor="file-upload-homes"
                className="flex-1 cursor-pointer border-2 border-dashed rounded-lg p-4 hover:border-primary transition-colors"
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  {file ? (
                    <>
                      <FileSpreadsheet className="h-8 w-8 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Click to select file
                      </span>
                    </>
                  )}
                </div>
              </label>
            </div>
          </div>

          <div className="bg-muted p-3 rounded-md text-sm">
            <p className="font-medium mb-2">Expected Excel format:</p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <strong>Option 1:</strong> With header row (recommended)
              </p>
              <div className="font-mono bg-background p-2 rounded text-xs">
                <div>Address/Lot | Target Completion Date</div>
                <div>123 Oakwood Drive | 2024-12-31</div>
                <div>456 Maple Street |</div>
                <div>789 Pine Avenue | 2025-01-15</div>
              </div>
              <p>
                <strong>Option 2:</strong> Without header row (columns in order)
              </p>
              <div className="font-mono bg-background p-2 rounded text-xs">
                <div>123 Oakwood Drive | 2024-12-31</div>
                <div>456 Maple Street |</div>
                <div>789 Pine Avenue | 2025-01-15</div>
              </div>
              <p className="mt-2 text-xs italic">
                The system automatically detects headers containing words like
                "address", "lot", or "completion". Target Completion Date is
                optional and can be left empty.
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md text-sm">
                <p className="font-medium">
                  Successfully imported {result.imported} home(s)
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-md text-sm">
                  <p className="font-medium mb-1">Errors:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={loading || !file}
            >
              {loading ? "Importing..." : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
