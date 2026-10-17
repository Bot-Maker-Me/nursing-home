import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/env'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2 ?? ''

/**
 * The service-role client, on its own so that server code which is NOT a route handler can
 * use it. `lib/supabase/admin.ts` re-exports this as `createAdminClient`.
 *
 * This module deliberately imports nothing from `next/headers` or `next/server`: the
 * middleware/proxy runs in the Edge runtime, where those are unavailable, and the IP access
 * guard runs there on every request.
 *
 * The key is a server secret. It bypasses Row Level Security, so this client must never be
 * handed to the browser and its results must never be returned unsanitised.
 */
export function createServiceClient(): SupabaseClient | null {
  if (!SERVICE_KEY) return null
  return createSupabaseClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
