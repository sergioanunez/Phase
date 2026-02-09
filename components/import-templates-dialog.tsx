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

interface ImportTemplatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ImportTemplatesDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportTemplatesDialogProps) {
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

      const res = await fetch("/api/templates/import", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to import templates")
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
      setError(err.message || "Failed to import templates")
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
          <DialogTitle>Import Work Items Template</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx or .xls) with columns: Name, Default
            Duration Days, Sort Order, Optional Category
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
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
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
                <div>Name | Default Duration Days | Sort Order | Optional Category</div>
                <div>Foundation | 7 | 1 | Structural</div>
                <div>Framing | 14 | 2 | Structural</div>
                <div>Roofing | 5 | 3 | Structural</div>
              </div>
              <p>
                <strong>Option 2:</strong> Without header row (columns in order)
              </p>
              <div className="font-mono bg-background p-2 rounded text-xs">
                <div>Foundation | 7 | 1 | Structural</div>
                <div>Framing | 14 | 2 | Structural</div>
                <div>Roofing | 5 | 3 | Structural</div>
              </div>
              <p className="mt-2 text-xs italic">
                The system automatically detects headers containing words like "name", "duration", "order", or "category".
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
                  Successfully imported {result.imported} template item(s)
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
