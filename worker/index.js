/* eslint-disable no-undef */
/**
 * Prepended to the Workbox-generated service worker by next-pwa (customWorkerSrc).
 * Handles Web Push display + notification clicks for Phase PWA.
 */
self.addEventListener("push", function (event) {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    data = { title: "Phase", body: event.data ? String(event.data.text()) : "" }
  }
  const title = data.title || "Phase"
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: {
      url: data.url || "/",
      type: data.type || "generic",
      ...(data.metadata && typeof data.metadata === "object" ? data.metadata : {}),
    },
    tag: data.tag || "phase-push",
    renotify: Boolean(data.renotify),
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", function (event) {
  event.notification.close()
  const raw = event.notification.data && event.notification.data.url
  const pathOrUrl = typeof raw === "string" && raw.length > 0 ? raw : "/"
  let targetUrl
  try {
    targetUrl = pathOrUrl.startsWith("http")
      ? new URL(pathOrUrl).href
      : new URL(pathOrUrl, self.location.origin).href
  } catch (_) {
    targetUrl = self.location.origin + "/"
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!client.url) continue
        try {
          const c = new URL(client.url)
          const t = new URL(targetUrl)
          if (c.origin === t.origin && "focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              return client.navigate(targetUrl).then(() => client.focus())
            }
            return client.focus()
          }
        } catch (_) {
          /* ignore */
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
