"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, X, Send } from "lucide-react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"

interface Message {
  role: "user" | "assistant"
  content: string
}

export function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = { role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      const data = await res.json()
      const assistantMessage: Message = {
        role: "assistant",
        content: data.message.content || "I'm sorry, I couldn't process that request.",
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("AI chat error:", error)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, an error occurred. Please try again.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = (action: string) => {
    setInput(action)
    handleSend()
  }

  const fabBottom = "bottom-[88px] md:bottom-6"
  const fabZ = "z-40"

  return (
    <>
      {/* FAB: always visible; when open shows X and acts as close */}
      <div
        className={cn(
          "fixed right-4",
          fabBottom,
          fabZ,
          "flex flex-col items-end gap-1"
        )}
      >
        <div className="group relative flex flex-col items-end">
          <Button
            type="button"
            onClick={() => setOpen((o) => !o)}
            size="icon"
            aria-label={open ? "Close" : "Ask Phase"}
            title={open ? "Close" : "Ask Phase"}
            className={cn(
              "h-14 w-14 rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-md",
              "hover:bg-primary/90 hover:shadow-lg active:scale-[0.96]",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              "transition-transform duration-200 ease-out",
              open && "rotate-90 scale-95"
            )}
          >
            {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
          </Button>
          {/* Desktop hover tooltip */}
          <span
            className={cn(
              "pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-sm transition-opacity duration-150",
              "hidden opacity-0 md:block group-hover:opacity-100"
            )}
            aria-hidden
          >
            {open ? "Close" : "Ask Phase"}
          </span>
          {/* Mobile: small label when open */}
          {open && (
            <span className="text-[10px] font-medium text-muted-foreground md:hidden">Close</span>
          )}
        </div>
      </div>

      {open && (
        <div
          className={cn(
            "fixed right-4 w-full max-w-md",
            "bottom-[152px] md:bottom-20",
            fabZ,
            "flex flex-col"
          )}
        >
          <Card className="shadow-2xl min-h-[320px] max-h-[calc(100vh-12rem)] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Ask Phase
              </CardTitle>
            </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto mb-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Ask me about schedules, tasks, or get help with your work.</p>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-left justify-start"
                    onClick={() => handleQuickAction("What tasks are pending confirmation?")}
                  >
                    Pending Confirmations
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-left justify-start"
                    onClick={() => handleQuickAction("Which homes are behind schedule?")}
                  >
                    Behind Schedule Homes
                  </Button>
                  {session?.user?.role !== "Subcontractor" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-left justify-start"
                      onClick={() => handleQuickAction("Show me today's plan")}
                    >
                      Today's Plan
                    </Button>
                  )}
                </div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm">Thinking...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask a question..."
              className="flex-1 px-3 py-2 border rounded-md"
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
        </div>
      )}
    </>
  )
}
