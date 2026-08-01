"use client"

import { SessionProvider } from "next-auth/react"
import { TransactionEngineProvider } from "@/components/transaction-engine-provider"
import { FeedbackBootstrap } from "@/components/feedback-bootstrap"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <FeedbackBootstrap />
      <TransactionEngineProvider>{children}</TransactionEngineProvider>
    </SessionProvider>
  )
}
