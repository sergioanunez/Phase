/**
 * Build-time guard for API routes. During production build (NEXT_PHASE=phase-production-build),
 * route handlers should return a harmless response without importing/initializing auth or DB code.
 * Use at the very top of each GET/POST/PUT/PATCH/DELETE handler.
 */
export const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build"

/**
 * Returns a 204 No Content response. Use when isBuildTime is true so the build
 * does not run auth/supabase/cookies/headers code.
 */
export function buildGuardResponse(): Response {
  return new Response(null, { status: 204 })
}
