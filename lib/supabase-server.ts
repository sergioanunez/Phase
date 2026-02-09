import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Server-only Supabase client with service role key.
 * Use for storage uploads, signed URL generation, and any server-side operations.
 * NEVER expose this client or the service role key to the client.
 */
export function getSupabaseServerClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for floor plan storage."
    )
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}

export const HOME_PLANS_BUCKET = "home-plans"

/**
 * White-label company assets: logos, favicons.
 * Paths: companies/{companyId}/branding/logo.{ext}, companies/{companyId}/branding/favicon.png
 * Create bucket in Supabase Dashboard (Storage) named "company-assets".
 * For public logo/favicon URLs, set bucket to Public or use RLS with read access for authenticated users.
 */
export const COMPANY_ASSETS_BUCKET = "company-assets"
