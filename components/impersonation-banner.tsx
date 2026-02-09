"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, X } from "lucide-react"

interface Context {
  active: boolean
  companyName?: string
  userName?: string
  companyId?: string
}

export function ImpersonationBanner() {
  const router = useRouter()
  const [context, setContext] = useState<Context>({ active: false })

  useEffect(() => {
    fetch("/api/super-admin/impersonation/context")
      .then((res) => res.json())
      .then((data) => setContext({ active: data.active, companyName: data.companyName, userName: data.userName }))
      .catch(() => setContext({ active: false }))
  }, [])

  const handleEnd = () => {
    fetch("/api/super-admin/impersonation/end", { method: "POST" })
      .then(() => {
        setContext({ active: false })
        router.push(context.companyId ? `/super-admin/companies/${context.companyId}` : "/super-admin/companies")
        router.refresh()
      })
      .catch(() => {})
  }

  if (!context.active || !context.companyName || !context.userName) return null

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-amber-500 text-amber-950 px-4 py-2 text-sm font-medium shadow">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Impersonating <strong>{context.companyName}</strong> as <strong>{context.userName}</strong>
        </span>
      </div>
      <button
        type="button"
        onClick={handleEnd}
        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-amber-950 font-medium"
      >
        <X className="h-4 w-4" />
        Exit
      </button>
    </div>
  )
}
