import { createClient, SupabaseClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client (service role).
 * Call this INSIDE request handlers only — never at module scope.
 * Env is read at call time; missing env throws (handle in route with try/catch → 500).
 */
export function createSupabaseServerClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server storage."
    )
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}

export const HOME_PLANS_BUCKET = "home-plans"
export const COMPANY_ASSETS_BUCKET = "company-assets"
