import { type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Service-role client for trusted server code. Bypasses Row Level Security and the per-table
 * grants that the session (anon) key depends on, so staff writes never fail with "permission
 * denied". Returns null when no service key is configured.
 */
export const createAdminClient = createServiceClient

export type StaffContext =
  | { ok: true; supabase: SupabaseClient; userId: string; role: string; usingServiceRole: boolean }
  | { ok: false; response: NextResponse }

/**
 * Verifies the caller is signed in with one of the allowed roles, then hands back a
 * database client. Uses the service-role client when configured (recommended, and it
 * bypasses RLS/grants) and falls back to the caller's session client otherwise.
 */
export async function requireStaff(allowedRoles: string[]): Promise<StaffContext> {
  const session = await createServerClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await session.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (!allowedRoles.includes(role)) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const service = createServiceClient()
  const supabase = (service ?? session) as SupabaseClient
  return { ok: true, supabase, userId: user.id, role, usingServiceRole: Boolean(service) }
}

export function requireAdmin() {
  return requireStaff(['admin'])
}
