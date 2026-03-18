"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { format } from "date-fns"
import { Search, Calendar, MessageSquare, X, AlertTriangle, CheckCircle, Clock, Send } from "lucide-react"

type Message = {
  id: string
  direction: string
  to: string
  from: string
  body: string
  status: string
  messageType: string | null
  recipientName: string | null
  homeId: string | null
  homeAddress: string | null
  subdivision: string | null
  taskId: string | null
  taskName: string | null
  createdAt: string
}

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "punchlist", label: "Punchlist" },
]

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "Sent", label: "Sent" },
  { value: "Delivered", label: "Delivered" },
  { value: "Failed", label: "Failed" },
]

export default function MessagesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [todayOnly, setTodayOnly] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [offset, setOffset] = useState(0)
  const limit = 50

  const role = (session?.user as any)?.role

  useEffect(() => {
    if (status === "loading") return
    if (!session?.user) {
      router.push("/auth/signin")
      return
    }
    if (role === "Subcontractor") {
      router.push("/my-schedule")
      return
    }
    fetchMessages()
  }, [session, status, role, typeFilter, statusFilter, todayOnly, offset])

  const fetchMessages = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== "all") params.set("type", typeFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (todayOnly) params.set("today", "true")
      if (search) params.set("search", search)
      params.set("limit", String(limit))
      params.set("offset", String(offset))

      const res = await fetch(`/api/messages?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setOffset(0)
    fetchMessages()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Delivered":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Delivered
          </Badge>
        )
      case "Failed":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      case "Sent":
        return (
          <Badge variant="secondary">
            <Send className="h-3 w-3 mr-1" />
            Sent
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getTypeBadge = (type: string | null) => {
    switch (type) {
      case "scheduled":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Scheduled</Badge>
      case "cancelled":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Cancelled</Badge>
      case "punchlist":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Punchlist</Badge>
      case "confirmation":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Confirmation</Badge>
      default:
        return <Badge variant="outline">General</Badge>
    }
  }

  const truncateBody = (body: string, maxLength = 80) => {
    if (body.length <= maxLength) return body
    return body.slice(0, maxLength) + "..."
  }

  if (status === "loading" || !session?.user) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Message Log</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A record of messages sent from the system.
          </p>
        </header>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search messages, recipients, phone numbers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} variant="secondary">
              Search
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                variant={typeFilter === filter.value ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setTypeFilter(filter.value)
                  setOffset(0)
                }}
              >
                {filter.label}
              </Button>
            ))}
            <div className="w-px bg-border mx-1" />
            <Button
              variant={todayOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTodayOnly(!todayOnly)
                setOffset(0)
              }}
            >
              <Calendar className="h-4 w-4 mr-1" />
              Today
            </Button>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setOffset(0)
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No messages found</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[120px]">Date/Time</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[90px]">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Home</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[140px]">Recipient</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[100px]">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[150px]">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {messages.map((msg) => (
                    <tr
                      key={msg.id}
                      onClick={() => setSelectedMessage(msg)}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm">{format(new Date(msg.createdAt), "MMM d, yyyy")}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(msg.createdAt), "h:mm a")}
                        </div>
                      </td>
                      <td className="px-4 py-3">{getTypeBadge(msg.messageType)}</td>
                      <td className="px-4 py-3">
                        {msg.homeAddress ? (
                          <div>
                            <div className="font-medium">{msg.homeAddress}</div>
                            {msg.subdivision && (
                              <div className="text-xs text-muted-foreground">{msg.subdivision}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>{msg.recipientName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{msg.to}</div>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(msg.status)}</td>
                      <td className="px-4 py-3 overflow-hidden">
                        <p className="text-muted-foreground truncate" title={msg.body}>
                          {truncateBody(msg.body)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > limit && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
                <div className="text-sm text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + limit >= total}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Message Details
            </DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {getTypeBadge(selectedMessage.messageType)}
                {getStatusBadge(selectedMessage.status)}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Sent</p>
                  <p className="font-medium">
                    {format(new Date(selectedMessage.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recipient</p>
                  <p className="font-medium">{selectedMessage.recipientName || "—"}</p>
                  <p className="text-xs text-muted-foreground">{selectedMessage.to}</p>
                </div>
                {selectedMessage.homeAddress && (
                  <div>
                    <p className="text-muted-foreground">Home</p>
                    <p className="font-medium">{selectedMessage.homeAddress}</p>
                    {selectedMessage.subdivision && (
                      <p className="text-xs text-muted-foreground">{selectedMessage.subdivision}</p>
                    )}
                  </div>
                )}
                {selectedMessage.taskName && (
                  <div>
                    <p className="text-muted-foreground">Task</p>
                    <p className="font-medium">{selectedMessage.taskName}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-2">Message</p>
                <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono">
                  {selectedMessage.body}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
