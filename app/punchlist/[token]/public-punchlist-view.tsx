"use client"

import { useState } from "react"
import { format } from "date-fns"

type Item = {
  number: number
  title: string
  description?: string
  notes?: string
  status: string
  photos: { id: string; url: string }[]
}

export function PublicPunchlistView({
  tenantName,
  address,
  dueDate,
  sentAt,
  items,
}: {
  tenantName: string
  address: string
  dueDate: Date | null
  sentAt: Date | null
  items: Item[]
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-foreground">
      <div className="mx-auto max-w-lg px-4 py-6 pb-10">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tenantName}
          </p>
          <h1 className="mt-1 text-xl font-bold">Punchlist</h1>
          <p className="mt-2 text-sm text-muted-foreground">{address}</p>
          {dueDate && (
            <p className="mt-1 text-sm font-medium">
              Due: {format(new Date(dueDate), "MMM d, yyyy")}
            </p>
          )}
        </header>

        {sentAt && (
          <p className="mb-4 text-xs text-muted-foreground">
            Sent on {format(new Date(sentAt), "MMM d, yyyy")}. Please address these items.
          </p>
        )}

        <ul className="space-y-5">
          {items.map((item) => (
            <li
              key={item.number}
              className="rounded-xl border border-border bg-white p-4 shadow-sm"
            >
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {item.number}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium">{item.title}</h2>
                  {(item.description || item.notes) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description || item.notes}
                    </p>
                  )}
                  {item.photos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.photos.map((photo) => {
                        const isPdf = photo.url.toLowerCase().includes(".pdf")
                        return (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => !isPdf && setLightboxUrl(photo.url)}
                            className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            {isPdf ? (
                              <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                PDF
                              </span>
                            ) : (
                              <img
                                src={photo.url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          Shared by {tenantName}
        </footer>
      </div>

      {lightboxUrl && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
          aria-label="Close"
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      )}
    </div>
  )
}
