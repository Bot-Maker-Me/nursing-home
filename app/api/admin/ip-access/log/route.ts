import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/admin'

/**
 * Admin API for the IP access audit log (Phase 2: read side).
 *
 * The table is append-only and admin-only, so this route both verifies the role and asks for
 * a bounded slice — newest first, capped at 200 rows, filtered by user and verdict.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LIMIT = 200

export async function GET(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const params = new URL(request.url).searchParams
  const userId = params.get('userId')?.trim() ?? ''
  const verdict = params.get('verdict') ?? ''
  const requestedLimit = Number(params.get('limit') ?? 50)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIMIT)
    : 50

  let query = context.supabase
    .from('ip_access_log')
    .select('id, user_id, ip, allowed, would_block, mode, matched_rule, source, path, user_agent, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (UUID_SHAPE.test(userId)) query = query.eq('user_id', userId)
  if (verdict === 'denied') query = query.eq('allowed', false)
  if (verdict === 'allowed') query = query.eq('allowed', true)
  // The Log-only rehearsal view: requests that enforcement would refuse.
  if (verdict === 'would_block') query = query.eq('would_block', true)

  const { data, error } = await query
  if (error) {
    const missingMigration = error.code === '42P01' || error.code === '42703'
    return NextResponse.json(
      {
        error: missingMigration
          ? 'The IP allowlist migration has not been applied to this database yet, so there is nothing to show.'
          : `The access log could not be loaded: ${error.message}`,
      },
      { status: missingMigration ? 503 : 500 },
    )
  }

  const rows = (data ?? []) as Array<{
    id: number
    user_id: string | null
    ip: string
    allowed: boolean
    would_block: boolean
    mode: string
    matched_rule: string
    source: string
    path: string
    user_agent: string | null
    created_at: string
  }>

  // Names for the ids actually present, so the table reads as people rather than uuids.
  const ids = Array.from(new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))))
  const names: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: profiles } = await context.supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
    for (const profile of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
      names[profile.id] = profile.full_name || 'Portal user'
    }
  }

  return NextResponse.json({ rows, names })
}
