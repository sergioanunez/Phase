import type {
  TransactionHandler,
  TransactionType,
} from "@/lib/transactions/types"

export class TransactionHandlerRegistry {
  private readonly handlers = new Map<TransactionType, TransactionHandler>()

  register<T extends TransactionType>(handler: TransactionHandler<T>): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Transaction handler already registered: ${handler.type}`)
    }
    this.handlers.set(handler.type, handler as unknown as TransactionHandler)
  }

  get<T extends TransactionType>(type: T): TransactionHandler<T> {
    const handler = this.handlers.get(type)
    if (!handler) {
      throw new Error(`No transaction handler registered for ${type}`)
    }
    return handler as unknown as TransactionHandler<T>
  }

  has(type: TransactionType): boolean {
    return this.handlers.has(type)
  }
}
