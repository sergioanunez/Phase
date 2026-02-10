/**
 * Re-exports for backward compatibility. Prefer importing from @/lib/supabase/server.
 * Server client must be created inside request handlers via createSupabaseServerClient().
 */
export {
  createSupabaseServerClient as getSupabaseServerClient,
  HOME_PLANS_BUCKET,
  COMPANY_ASSETS_BUCKET,
} from "./supabase/server"
