import { createClient, SupabaseClient } from "@supabase/supabase-js"

/**
 * Browser Supabase client (anon key).
 * Call at runtime in client components or after mount — never at module scope.
 * Env is read at call time.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for browser client."
    )
  }
  return createClient(url, anonKey)
}
