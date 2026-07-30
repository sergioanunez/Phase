"use client"

import { SessionProvider } from "next-auth/react"
import { TransactionEngineProvider } from "@/components/transaction-engine-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TransactionEngineProvider>{children}</TransactionEngineProvider>
    </SessionProvider>
  )
}
