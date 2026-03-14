"use client"

import { Card, CardContent } from "@/components/ui/card"
import { ActionPreviewCard } from "./ActionPreviewCard"
import type { ExecutePreviewPayload } from "@/lib/assistant/types"

export type FeedItem =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "assistant"; text: string }
  | {
      id: string
      type: "preview"
      text: string
      preview: ExecutePreviewPayload
      onApprove: () => void
      onCancel: () => void
      loading?: boolean
    }
  | { id: string; type: "execution_result"; text: string; success: boolean }

type Props = {
  items: FeedItem[]
}

function renderItem(item: FeedItem) {
  if (item.type === "user") {
    return (
      <div key={item.id} className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-sky-100 px-3 py-2 text-sm text-sky-900">
          {item.text}
        </div>
      </div>
    )
  }
  if (item.type === "assistant") {
    return (
      <div key={item.id} className="flex justify-start">
        <Card className="max-w-[95%] border-gray-200 bg-white">
          <CardContent className="py-3">
            <p className="text-sm font-medium text-foreground">Assistant</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.text}</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (item.type === "preview") {
    return (
      <div key={item.id} className="flex justify-start">
        <div className="w-full max-w-md space-y-2">
          <Card className="border-gray-200 bg-white">
            <CardContent className="py-3">
              <p className="text-sm font-medium text-foreground">Assistant</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.text}</p>
            </CardContent>
          </Card>
          <ActionPreviewCard
            preview={item.preview}
            onApprove={item.onApprove}
            onCancel={item.onCancel}
            loading={item.loading}
          />
        </div>
      </div>
    )
  }
  if (item.type === "execution_result") {
    return (
      <div key={item.id} className="flex justify-start">
        <Card
          className={`max-w-[95%] ${item.success ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}
        >
          <CardContent className="py-3">
            <p className="text-sm font-medium text-foreground">
              {item.success ? "Done" : "Error"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  return null
}

export function AssistantFeed({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">Conversation &amp; actions</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask about your schedule or tell the Assistant what to do. All execution requires your
          approval.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Try asking: <strong>What needs attention today</strong>,{" "}
          <strong>Schedule upcoming tasks</strong>, <strong>Create a punchlist</strong>
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {items.map((item) => renderItem(item))}
    </div>
  )
}
