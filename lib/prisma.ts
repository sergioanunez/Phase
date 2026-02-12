import { PrismaClient } from "@prisma/client"
import { env } from "./env"

// Touch env so validation runs at startup (values are read by Prisma under the hood).
void env

// Server-side startup log: which host DATABASE_URL points to (password masked) to confirm pooler at runtime.
if (typeof window === "undefined" && process.env.DATABASE_URL) {
  try {
    const u = new URL(process.env.DATABASE_URL)
    u.password = "***"
    u.username = u.username ? "***" : u.username
    console.log("[prisma] runtime DATABASE_URL host:", u.hostname, "port:", u.port || "5432")
  } catch {
    console.log("[prisma] runtime DATABASE_URL set (host not parsed)")
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
