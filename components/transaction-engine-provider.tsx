"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useSession } from "next-auth/react"
import { TransactionEngine } from "@/lib/transactions"
import type {
  AggregateTransactionStatus,
  TransactionDispatchInput,
  TransactionDispatchResult,
} from "@/lib/transactions"
import { isPunchCreateTransactionEngineEnabled } from "@/lib/transactions/feature-flags"
import { removeSyncedLocalPunchItemsOlderThan } from "@/lib/transactions/local-punch-items"

type TransactionEngineContextValue = {
  enabled: boolean
  ready: boolean
  engine: TransactionEngine | null
  status: AggregateTransactionStatus | null
  dispatch: (
    input: TransactionDispatchInput
  ) => Promise<TransactionDispatchResult>
}

const TransactionEngineContext = createContext<TransactionEngineContextValue | null>(
  null
)

export function TransactionEngineProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession()
  const enabled = isPunchCreateTransactionEngineEnabled()
  const [engine, setEngine] = useState<TransactionEngine | null>(null)
  const [ready, setReady] = useState(false)
  const [aggregate, setAggregate] = useState<AggregateTransactionStatus | null>(null)
  const engineRef = useRef<TransactionEngine | null>(null)

  const tenantId = session?.user?.companyId ?? null
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!enabled) {
      setEngine(null)
      setReady(false)
      return
    }
    if (sessionStatus === "loading") return
    if (!tenantId || !userId) {
      setEngine(null)
      setReady(false)
      return
    }

    let cancelled = false
    const next = new TransactionEngine({ tenantId, userId })

    ;(async () => {
      const { punchItemCreateHandler } = await import(
        "@/lib/transactions/handlers/punch-item-create"
      )
      next.registerHandler(punchItemCreateHandler)
      await next.initialize()
      if (cancelled) {
        next.stop()
        return
      }
      engineRef.current = next
      setEngine(next)
      setAggregate(next.getStatus())
      setReady(true)
      await removeSyncedLocalPunchItemsOlderThan(7 * 24 * 60 * 60 * 1000).catch(() => {})
      void next.sync().catch(() => {})
    })()

    const unsub = next.subscribe((status) => {
      if (!cancelled) setAggregate(status)
    })

    return () => {
      cancelled = true
      unsub()
      next.stop()
      if (engineRef.current === next) engineRef.current = null
      setEngine(null)
      setReady(false)
    }
  }, [enabled, tenantId, userId, sessionStatus])

  const dispatch = useCallback(
    async (input: TransactionDispatchInput) => {
      if (!engineRef.current) {
        throw new Error("Transaction engine is not ready")
      }
      return engineRef.current.dispatch(input)
    },
    []
  )

  const value = useMemo<TransactionEngineContextValue>(
    () => ({
      enabled,
      ready: enabled && ready && !!engine,
      engine,
      status: aggregate,
      dispatch,
    }),
    [enabled, ready, engine, aggregate, dispatch]
  )

  return (
    <TransactionEngineContext.Provider value={value}>
      {children}
    </TransactionEngineContext.Provider>
  )
}

export function useTransactionEngine(): TransactionEngineContextValue {
  const ctx = useContext(TransactionEngineContext)
  if (!ctx) {
    return {
      enabled: false,
      ready: false,
      engine: null,
      status: null,
      dispatch: async () => {
        throw new Error("TransactionEngineProvider is not mounted")
      },
    }
  }
  return ctx
}
