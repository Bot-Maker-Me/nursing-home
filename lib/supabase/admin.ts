import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SUPABASE_URL } from '@/lib/supabase/env'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2 ?? ''

/**
 * Service-role client for trusted server code. Bypasses Row Level Security and the
 * per-table grants that the session (anon) key depends on, so admin writes never fail
 * with "permission denied" even on databases set up only from supabase/migrations.
 * Returns null when no service key is configured.
 */
export function createAdminClient(): SupabaseClient | null {
  if (!SERVICE_KEY) return null
  return createSupabaseClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type AdminContext =
  | { admin: true; supabase: SupabaseClient; userId: string; usingServiceRole: boolean }
  | { admin: false; response: NextResponse }

/**
 * Verifies the caller is a signed-in admin, then hands back a database client for the
 * admin operation. Uses the service-role client when configured (recommended, and it
 * bypasses RLS/grants) and falls back to the caller's session client otherwise.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const session = await createServerClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { admin: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await session.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return { admin: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const service = createAdminClient()
  const supabase = (service ?? session) as SupabaseClient
  return { admin: true, supabase, userId: user.id, usingServiceRole: Boolean(service) }
}
