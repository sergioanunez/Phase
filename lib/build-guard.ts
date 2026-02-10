/**
 * Use in API route handlers to avoid running prisma/auth/rbac at build time.
 * Return early with a safe response when Next/Vercel is collecting route data.
 */
export function isBuild(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    (process.env.VERCEL === "1" && process.env.CI === "1")
  )
}
