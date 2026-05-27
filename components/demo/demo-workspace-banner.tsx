"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type DemoStatus = {
  showBanner: boolean
  canClearDemo: boolean
}

export function DemoWorkspaceBanner() {
  const { data: session } = useSession()
  const router = useRouter()
  const [status, setStatus] = useState<DemoStatus | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const role = session?.user?.role
  const canManage = role === "Admin" || role === "Manager"

  const loadStatus = useCallback(() => {
    if (!canManage) {
      setStatus({ showBanner: false, canClearDemo: false })
      return
    }
    fetch("/api/demo/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.showBanner === "boolean") {
          setStatus({
            showBanner: data.showBanner,
            canClearDemo: data.canClearDemo ?? false,
          })
        } else {
          setStatus({ showBanner: false, canClearDemo: false })
        }
      })
      .catch(() => setStatus({ showBanner: false, canClearDemo: false }))
  }, [canManage])

  useEffect(() => {
    if (session?.user === undefined) return
    loadStatus()
  }, [session?.user, loadStatus])

  const handleClear = async () => {
    setClearing(true)
    setError(null)
    try {
      const res = await fetch("/api/demo/clear", {
        method: "POST",
        credentials: "same-origin",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not clear demo data.")
        return
      }
      setModalOpen(false)
      setStatus({ showBanner: false, canClearDemo: false })
      setSuccessMessage("Demo workspace cleared. Your account is ready for real projects.")
      router.push(data.redirectTo ?? "/homes")
      router.refresh()
    } catch {
      setError("Could not clear demo data. Please try again.")
    } finally {
      setClearing(false)
    }
  }

  if (!canManage) return null

  return (
    <>
      {successMessage && (
        <div
          className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm text-emerald-900"
          role="status"
        >
          {successMessage}
        </div>
      )}
      {status?.showBanner && (
        <div className="border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 sm:flex-row sm:gap-4">
            <p className="text-center text-sm text-amber-950 sm:text-left">
              <span className="font-semibold">Demo Workspace</span>
              <span className="text-amber-900/90">
                {" "}
                — Sample homes and activity are shown so you can explore Phase. Real data you add
                is kept separate.
              </span>
            </p>
            {status.canClearDemo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                onClick={() => setModalOpen(true)}
              >
                Clear demo data
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear demo workspace?</DialogTitle>
            <DialogDescription>
              This will permanently remove all sample homes, demo tasks, demo activity, and demo
              contractors from your workspace. Real data will not be affected.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleClear} disabled={clearing}>
              {clearing ? "Clearing…" : "Clear Demo Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
