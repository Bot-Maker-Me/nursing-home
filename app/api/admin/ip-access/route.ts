import { NextResponse } from 'next/server'
import { resolveClientIp } from '@/lib/ip-access'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireAdmin } from '@/lib/supabase/admin'

/**
 * Admin API for the per-user / per-pharmacy IP allowlist.
 *
 * Every handler starts with `requireAdmin()`, which verifies the caller's role server-side
 * and (when SUPABASE_SERVICE_ROLE_KEY is set) hands back the service-role client. The service
 * key never leaves this process — no client-side code sees it.
 */

const MODES = ['off', 'log_only', 'enforce'] as const
type Mode = (typeof MODES)[number]

/** What a rule can belong to: one user, one nursing home, or one pharmacy. */
const SCOPES = ['user', 'home', 'pharmacy'] as const
type Scope = (typeof SCOPES)[number]

/** The single target column that is populated on an allowlist row. */
function targetIdOf(row: {
  scope: string
  user_id?: string | null
  home_id?: string | null
  pharmacy_id?: string | null
}): string {
  if (row.scope === 'user') return row.user_id ?? ''
  if (row.scope === 'home') return row.home_id ?? ''
  return row.pharmacy_id ?? ''
}

/** Loose shape check only — it rejects prose before the write; Postgres validates the rest. */
const CIDR_SHAPE = /^[0-9a-fA-F.:/]+$/
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DbError = { code?: string; message?: string }

/** Turns a Postgres failure into something an administrator can act on. */
function explain(error: DbError, action: 'save' | 'load' | 'remove'): { error: string; status: number } {
  switch (error.code) {
    case '23505':
      return { error: 'That IP address or range is already on this allowlist.', status: 409 }
    case '22P02':
      return {
        error: 'That IP address or range is not valid. Use an IPv4 or IPv6 address, or a range such as 203.0.113.0/24.',
        status: 400,
      }
    case '23514':
      return { error: 'A rule belongs to either a user or a pharmacy, not both.', status: 400 }
    case '42501':
      return {
        error: 'The database refused the write. Re-run the IP allowlist migration (supabase/migrations/20261017000000_ip_allowlist.sql).',
        status: 503,
      }
    case '42P01':
    case '42703':
      return {
        error: 'The IP allowlist migration has not been applied to this database yet. Run supabase/migrations/20261017000000_ip_allowlist.sql, then reload this page.',
        status: 503,
      }
    default:
      return {
        error:
          action === 'remove'
            ? `That allowlist entry could not be removed: ${error.message ?? 'unknown database error'}.`
            : `That could not be ${action === 'load' ? 'loaded' : 'saved'}: ${error.message ?? 'unknown database error'}.`,
        status: 500,
      }
  }
}

function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

/** GET — the pickers, the rules, and the caller's own IP as the server sees it. */
export async function GET(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  // The admin's own IP, resolved here from the proxy headers, so "Add my current IP" never
  // has to trust a value the browser supplied.
  const own = resolveClientIp(request.headers)

  const [profilesResult, homesResult, pharmaciesResult, rulesResult, usersResult] = await Promise.all([
    context.supabase
      .from('profiles')
      .select('id, full_name, role, home_id, pharmacy_id, ip_restriction_mode, ip_fail_closed')
      .order('full_name'),
    context.supabase.from('homes').select('id, name, city, ip_restriction_mode, ip_fail_closed').order('name'),
    context.supabase.from('pharmacies').select('id, name, ip_restriction_mode, ip_fail_closed').order('name'),
    context.supabase
      .from('ip_allowlist')
      .select('id, scope, user_id, home_id, pharmacy_id, cidr, label, created_at')
      .order('created_at'),
    // Optional: only used to show an email beside a name. A deployment without the
    // service-role key falls back to names alone instead of failing the page.
    context.supabase.auth.admin.listUsers({ perPage: 200 }),
  ])

  const failure = profilesResult.error ?? homesResult.error ?? pharmaciesResult.error ?? rulesResult.error
  if (failure) {
    const reason = explain(failure, 'load')
    return NextResponse.json({ error: reason.error }, { status: reason.status })
  }

  const emailById = new Map<string, string>()
  if (!usersResult.error) {
    for (const candidate of usersResult.data?.users ?? []) {
      if (candidate.email) emailById.set(candidate.id, candidate.email)
    }
  }

  const homeRows = (homesResult.data ?? []) as Array<{
    id: string
    name: string
    city: string | null
    ip_restriction_mode: string
    ip_fail_closed: boolean
  }>
  const pharmacyRows = (pharmaciesResult.data ?? []) as Array<{
    id: string
    name: string
    ip_restriction_mode: string
    ip_fail_closed: boolean
  }>
  const homeNameById = new Map(homeRows.map((row) => [row.id, row.name]))
  const pharmacyNameById = new Map(pharmacyRows.map((row) => [row.id, row.name]))

  const users = ((profilesResult.data ?? []) as Array<{
    id: string
    full_name: string | null
    role: string | null
    home_id: string | null
    pharmacy_id: string | null
    ip_restriction_mode: string
    ip_fail_closed: boolean
  }>).map((row) => ({
    id: row.id,
    name: row.full_name || emailById.get(row.id)?.split('@')[0] || 'Portal user',
    email: emailById.get(row.id) ?? '',
    role: row.role ?? '',
    mode: isMode(row.ip_restriction_mode) ? row.ip_restriction_mode : 'off',
    failClosed: Boolean(row.ip_fail_closed),
    homeId: row.home_id,
    homeName: row.home_id ? homeNameById.get(row.home_id) ?? '' : '',
    pharmacyId: row.pharmacy_id,
    pharmacyName: row.pharmacy_id ? pharmacyNameById.get(row.pharmacy_id) ?? '' : '',
  }))

  const homes = homeRows.map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city ?? '',
    mode: isMode(row.ip_restriction_mode) ? row.ip_restriction_mode : 'off',
    failClosed: Boolean(row.ip_fail_closed),
  }))

  const pharmacies = pharmacyRows.map((row) => ({
    id: row.id,
    name: row.name,
    mode: isMode(row.ip_restriction_mode) ? row.ip_restriction_mode : 'off',
    failClosed: Boolean(row.ip_fail_closed),
  }))

  // A rule can point at a user, a nursing home or a pharmacy — all three are named here so
  // the console never has to guess, and a deleted target degrades to a readable label.
  const nameFor = (scope: 'user' | 'home' | 'pharmacy', id: string) =>
    scope === 'user'
      ? users.find((user) => user.id === id)?.name
      : scope === 'home'
        ? homes.find((home) => home.id === id)?.name
        : pharmacies.find((pharmacy) => pharmacy.id === id)?.name

  const rules = ((rulesResult.data ?? []) as Array<{
    id: string
    scope: 'user' | 'home' | 'pharmacy'
    user_id: string | null
    home_id: string | null
    pharmacy_id: string | null
    cidr: string
    label: string
    created_at: string
  }>).map((row) => {
    const targetId =
      row.scope === 'user' ? row.user_id ?? '' : row.scope === 'home' ? row.home_id ?? '' : row.pharmacy_id ?? ''
    return {
      id: row.id,
      scope: row.scope,
      targetId,
      targetName: nameFor(row.scope, targetId) ?? 'Removed target',
      cidr: row.cidr,
      label: row.label,
      createdAt: row.created_at,
    }
  })

  return NextResponse.json({
    currentIp: own.ip,
    currentIpEvidence: own.evidence,
    users,
    homes,
    pharmacies,
    rules,
  })
}

/** POST — add an IP or range to a user's, a nursing home's or a pharmacy's allowlist. */
export async function POST(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const limitResult = await rateLimit(`ip-allowlist-write:${context.userId}`, { limit: 60, windowSeconds: 3600 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  const body = await request.json().catch(() => null)
  const scope = SCOPES.includes(body?.scope) ? (body.scope as Scope) : null
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : ''
  const cidr = typeof body?.cidr === 'string' ? body.cidr.trim() : ''
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) : ''

  if (!scope || !UUID_SHAPE.test(targetId)) {
    return NextResponse.json({ error: 'Choose a user, a nursing home or a pharmacy first.' }, { status: 400 })
  }
  if (!cidr || cidr.length > 64 || !CIDR_SHAPE.test(cidr)) {
    return NextResponse.json(
      { error: 'Enter a valid IP address or range, for example 203.0.113.7 or 203.0.113.0/24.' },
      { status: 400 },
    )
  }

  const { data, error } = await context.supabase
    .from('ip_allowlist')
    .insert({
      scope,
      user_id: scope === 'user' ? targetId : null,
      home_id: scope === 'home' ? targetId : null,
      pharmacy_id: scope === 'pharmacy' ? targetId : null,
      cidr,
      label,
      created_by: context.userId,
    })
    .select('id, scope, user_id, home_id, pharmacy_id, cidr, label, created_at')
    .single()

  if (error) {
    const reason = explain(error, 'save')
    return NextResponse.json({ error: reason.error }, { status: reason.status })
  }

  return NextResponse.json({
    ok: true,
    rule: {
      id: data.id,
      scope: data.scope,
      targetId: targetIdOf(data),
      cidr: data.cidr,
      label: data.label,
      createdAt: data.created_at,
    },
  })
}

/** PATCH — set a target's mode ('off' | 'log_only' | 'enforce') and its fail-closed flag. */
export async function PATCH(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const limitResult = await rateLimit(`ip-allowlist-write:${context.userId}`, { limit: 60, windowSeconds: 3600 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  const body = await request.json().catch(() => null)
  const scope = SCOPES.includes(body?.scope) ? (body.scope as Scope) : null
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : ''
  const mode = body?.mode
  const failClosed = typeof body?.failClosed === 'boolean' ? body.failClosed : undefined

  if (!scope || !UUID_SHAPE.test(targetId)) {
    return NextResponse.json({ error: 'Choose a user, a nursing home or a pharmacy first.' }, { status: 400 })
  }
  if (!isMode(mode)) {
    return NextResponse.json({ error: 'Choose a mode: off, log only, or enforce.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { ip_restriction_mode: mode }
  if (failClosed !== undefined) update.ip_fail_closed = failClosed

  const { error } = await context.supabase
    .from(scope === 'user' ? 'profiles' : scope === 'home' ? 'homes' : 'pharmacies')
    .update(update)
    .eq('id', targetId)

  if (error) {
    const reason = explain(error, 'save')
    return NextResponse.json({ error: reason.error }, { status: reason.status })
  }

  // Reported back so the console can warn about the one genuinely dangerous combination:
  // enforce + fail-closed + no IPs at all blocks that account everywhere.
  const { count } = await context.supabase
    .from('ip_allowlist')
    .select('id', { count: 'exact', head: true })
    .eq(scope === 'user' ? 'user_id' : scope === 'home' ? 'home_id' : 'pharmacy_id', targetId)
  const ruleCount = count ?? 0

  const warning =
    mode === 'enforce' && ruleCount === 0 && failClosed === true
      ? 'Saved, but fail-closed enforcement is on with no allowed IPs — everyone this covers will be blocked from every IP until you add one.'
      : null

  return NextResponse.json({
    ok: true,
    mode,
    failClosed: failClosed ?? null,
    ruleCount,
    warning,
  })
}

/** DELETE — remove one allowlist entry. */
export async function DELETE(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const limitResult = await rateLimit(`ip-allowlist-write:${context.userId}`, { limit: 60, windowSeconds: 3600 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!UUID_SHAPE.test(id)) return NextResponse.json({ error: 'That allowlist entry could not be found.' }, { status: 400 })

  const { error } = await context.supabase.from('ip_allowlist').delete().eq('id', id)
  if (error) {
    const reason = explain(error, 'remove')
    return NextResponse.json({ error: reason.error }, { status: reason.status })
  }
  return NextResponse.json({ ok: true })
}
