"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, BellOff, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Decodes VAPID public key for PushManager.subscribe.
 * DOM lib types require BufferSource with ArrayBuffer backing; TS still widens to ArrayBufferLike
 * on some versions — assert for compatibility with strict PushSubscriptionOptions typing.
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray as BufferSource
}

function supportsWebPush(): boolean {
  if (typeof window === "undefined") return false
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export function PushNotificationSettings({ className }: { className?: string }) {
  const [supported, setSupported] = useState(false)
  const [vapidConfigured, setVapidConfigured] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** When enrolled: preferences panel starts collapsed; expanded in-session only. */
  const [enrolledExpanded, setEnrolledExpanded] = useState(false)

  const [prefs, setPrefs] = useState({
    enabled: true,
    notifySubcontractorReply: true,
    notifyFlowAlerts: true,
    notifyPunchlist: true,
  })

  /** Browser allowed push + this device has an active push subscription saved locally. */
  const isFullyEnrolled = subscribed && permission === "granted"

  const refreshPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/push/preferences")
      if (!res.ok) return
      const data = await res.json()
      setPrefs({
        enabled: data.enabled !== false,
        notifySubcontractorReply: data.notifySubcontractorReply !== false,
        notifyFlowAlerts: data.notifyFlowAlerts !== false,
        notifyPunchlist: data.notifyPunchlist !== false,
      })
    } catch {
      /* ignore */
    }
  }, [])

  const refreshSubscriptionState = useCallback(async () => {
    if (!supportsWebPush()) {
      setSupported(false)
      setLoading(false)
      return
    }
    setSupported(true)
    setPermission(Notification.permission)

    try {
      const vRes = await fetch("/api/push/vapid-public-key")
      const vJson = await vRes.json()
      setVapidConfigured(!!vJson.configured && !!vJson.publicKey)

      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        setSubscribed(!!sub)
      } else {
        setSubscribed(false)
      }
    } catch {
      setVapidConfigured(false)
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshSubscriptionState()
    refreshPrefs()
  }, [refreshSubscriptionState, refreshPrefs])

  const savePrefs = async (patch: Partial<typeof prefs>) => {
    try {
      const res = await fetch("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const data = await res.json()
        setPrefs({
          enabled: data.enabled !== false,
          notifySubcontractorReply: data.notifySubcontractorReply !== false,
          notifyFlowAlerts: data.notifyFlowAlerts !== false,
          notifyPunchlist: data.notifyPunchlist !== false,
        })
      }
    } catch {
      setError("Could not save preferences.")
    }
  }

  const enablePush = async () => {
    setError(null)
    setWorking(true)
    try {
      const vRes = await fetch("/api/push/vapid-public-key")
      const vJson = await vRes.json()
      if (!vJson.configured || !vJson.publicKey) {
        setError("Push is not configured on the server (missing VAPID keys).")
        setWorking(false)
        return
      }

      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      await navigator.serviceWorker.ready

      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") {
        setWorking(false)
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vJson.publicKey),
      })
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("Could not read subscription keys from the browser.")
        setWorking(false)
        return
      }

      const res = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent.slice(0, 500),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || "Failed to save subscription.")
        setWorking(false)
        return
      }
      setSubscribed(true)
      setEnrolledExpanded(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setWorking(false)
    }
  }

  const disablePush = async () => {
    setError(null)
    setWorking(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch(`/api/push/subscription?endpoint=${encodeURIComponent(endpoint)}`, {
          method: "DELETE",
        })
      } else {
        await fetch("/api/push/subscription", { method: "DELETE" })
      }
      setSubscribed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unsubscribe.")
    } finally {
      setWorking(false)
    }
  }

  const notifySection = (
    <div
      className={cn("space-y-3 border-t border-border", isFullyEnrolled ? "pt-3" : "pt-4")}
    >
      <p className="text-sm font-medium text-foreground">What to notify</p>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm">Master switch</span>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input shrink-0"
          checked={prefs.enabled}
          onChange={(e) => {
            const c = e.target.checked
            setPrefs((p) => ({ ...p, enabled: c }))
            savePrefs({ enabled: c })
          }}
          disabled={!subscribed}
        />
      </label>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm">Subcontractor SMS replies (Y/N)</span>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input shrink-0"
          checked={prefs.notifySubcontractorReply}
          onChange={(e) => {
            const c = e.target.checked
            setPrefs((p) => ({ ...p, notifySubcontractorReply: c }))
            savePrefs({ notifySubcontractorReply: c })
          }}
          disabled={!subscribed || !prefs.enabled}
        />
      </label>
      <div className="space-y-1">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="text-sm">Flow needs attention (today)</span>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input shrink-0"
            checked={prefs.notifyFlowAlerts}
            onChange={(e) => {
              const c = e.target.checked
              setPrefs((p) => ({ ...p, notifyFlowAlerts: c }))
              savePrefs({ notifyFlowAlerts: c })
            }}
            disabled={!subscribed || !prefs.enabled}
          />
        </label>
        {!isFullyEnrolled && (
          <p className="text-xs text-muted-foreground pr-2">
            Superintendents only get alerts for homes assigned to them. If your deployment sets{" "}
            <code className="text-[11px]">CRON_SECRET</code> and a schedule (e.g. Vercel cron), Flow checks
            run without opening the Flow page.
          </p>
        )}
      </div>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm">Punchlist updates</span>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input shrink-0"
          checked={prefs.notifyPunchlist}
          onChange={(e) => {
            const c = e.target.checked
            setPrefs((p) => ({ ...p, notifyPunchlist: c }))
            savePrefs({ notifyPunchlist: c })
          }}
          disabled={!subscribed || !prefs.enabled}
        />
      </label>
      {!subscribed && (
        <p className="text-xs text-muted-foreground">
          Enable notifications on this device to change category preferences.
        </p>
      )}
    </div>
  )

  if (!supported) {
    return (
      <section
        className={cn(
          "rounded-lg border border-border bg-white p-4 text-sm text-muted-foreground mb-6",
          className
        )}
      >
        <h2 className="text-base font-semibold text-foreground mb-1">Push notifications</h2>
        <p>
          This browser does not support web push (service worker, Push Manager, or Notifications). Try
          Chrome, Edge, or Safari on a supported version with the app installed or pinned.
        </p>
      </section>
    )
  }

  if (loading) {
    return (
      <section
        className={cn(
          "rounded-lg border border-border bg-white p-4 flex items-center gap-2 mb-6",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading push settings…</span>
      </section>
    )
  }

  if (isFullyEnrolled) {
    return (
      <section
        className={cn("rounded-lg border border-border bg-white p-3 space-y-2 mb-4", className)}
      >
        <button
          type="button"
          onClick={() => setEnrolledExpanded((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md py-1.5 pl-1 pr-1 text-left outline-none transition-colors",
            "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          aria-expanded={enrolledExpanded}
          aria-controls="push-notification-preferences-panel"
          id="push-notification-status-toggle"
        >
          <div className="rounded-full bg-primary/10 p-1.5 text-primary shrink-0">
            <Bell className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground leading-tight">Push notifications ON</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Allowed • Subscribed</p>
          </div>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground">
            Manage
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                enrolledExpanded && "rotate-180"
              )}
              aria-hidden
            />
          </span>
        </button>

        {vapidConfigured === false && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
            Push is not enabled for this deployment (VAPID keys). Set{" "}
            <code className="text-[10px]">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and{" "}
            <code className="text-[10px]">VAPID_PRIVATE_KEY</code>.
          </p>
        )}

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2.5 py-1.5">{error}</p>
        )}

        {enrolledExpanded && (
          <div
            id="push-notification-preferences-panel"
            role="region"
            aria-labelledby="push-notification-status-toggle"
            className="space-y-3 border-t border-border pt-3"
          >
            <div className="space-y-3">{notifySection}</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={disablePush}
              disabled={working}
            >
              {working ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Turning off…
                </>
              ) : (
                "Turn off on this device"
              )}
            </Button>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className={cn("rounded-lg border border-border bg-white p-4 space-y-4 mb-6", className)}>
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary shrink-0">
          {subscribed ? <Bell className="h-5 w-5" aria-hidden /> : <BellOff className="h-5 w-5" aria-hidden />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">Push notifications</h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Get operational alerts on this device: subcontractor SMS replies, Flow attention, and punchlist
            updates. We only send these after you enable them here — not on first visit.
          </p>
        </div>
      </div>

      {vapidConfigured === false && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Push is not enabled for this deployment yet (VAPID keys). Your administrator should set{" "}
          <code className="text-xs">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and{" "}
          <code className="text-xs">VAPID_PRIVATE_KEY</code>.
        </p>
      )}

      {permission === "denied" && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          Notifications are blocked for this site. Use your browser&apos;s site settings to allow
          notifications for Phase, then try again.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {!subscribed ? (
          <Button
            type="button"
            onClick={enablePush}
            disabled={working || permission === "denied" || !vapidConfigured}
          >
            {working ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Enabling…
              </>
            ) : (
              "Enable notifications on this device"
            )}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={disablePush} disabled={working}>
            {working ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Turning off…
              </>
            ) : (
              "Turn off on this device"
            )}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          Permission:{" "}
          <span className="font-medium text-foreground">
            {permission === "unsupported"
              ? "—"
              : permission === "granted"
                ? "allowed"
                : permission === "denied"
                  ? "blocked"
                  : "not asked"}
          </span>
          {subscribed ? " · subscribed" : ""}
        </span>
      </div>

      <div className="space-y-3 border-t border-border pt-4">{notifySection}</div>
    </section>
  )
}
