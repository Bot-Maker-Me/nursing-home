import { createServiceClient } from '@/lib/supabase/service'

/**
 * Server-side client-IP resolution — the ONLY place an IP is read for access decisions.
 *
 * An IP is taken from the headers the platform's edge sets, never from the caller: on Vercel
 * the edge REPLACES `x-forwarded-for` (and sets `x-real-ip`), so a browser cannot forge
 * either by sending its own copy. Nothing in this file reads an IP from a request body, a
 * query string, a cookie, or a client-set header such as `x-client-ip`, and nothing accepts
 * an IP chosen by the browser.
 *
 * `x-real-ip` is preferred because it holds a single value; `x-forwarded-for` is a list whose
 * LEFTMOST entry is the client on Vercel. `evidence` is what the access log records, so the
 * trusted position can be confirmed from real traffic instead of assumed.
 */
export type ResolvedClientIp = {
  ip: string
  evidence: Record<string, string>
}

export const UNKNOWN_IP = 'unknown'

/** The exact wording a restricted user sees. It never names an allowed address. */
export const ACCESS_RESTRICTED_MESSAGE =
  "Access is restricted to your organisation's network. Contact your administrator."

/**
 * A client that reaches us over IPv4 through an IPv6-capable edge is often reported as
 * `::ffff:203.0.113.7`. Postgres would store that as an IPv6 address, which never matches an
 * IPv4 rule, so the mapped form is unwrapped to the plain IPv4 address before matching.
 */
export function normalizeIp(value: string): string {
  const trimmed = value.trim()
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed)
  return mapped ? mapped[1] : trimmed
}

function firstEntry(value: string): string {
  return normalizeIp(value.split(',')[0] ?? '')
}

export function resolveClientIp(headers: Headers): ResolvedClientIp {
  const realIp = headers.get('x-real-ip')?.trim() ?? ''
  const vercelForwarded = headers.get('x-vercel-forwarded-for')?.trim() ?? ''
  const forwardedFor = headers.get('x-forwarded-for')?.trim() ?? ''

  // Diagnostics only — these two headers are safe to record; cookies and authorization are
  // deliberately never captured.
  const evidence: Record<string, string> = {}
  if (realIp) evidence['x-real-ip'] = realIp
  if (forwardedFor) evidence['x-forwarded-for'] = forwardedFor
  if (vercelForwarded) evidence['x-vercel-forwarded-for'] = vercelForwarded

  const ip = firstEntry(realIp) || firstEntry(vercelForwarded) || firstEntry(forwardedFor)
  return { ip: ip || UNKNOWN_IP, evidence }
}

/** What the database decided about one request. */
export type IpGuardVerdict = {
  ip: string
  mode: 'off' | 'log_only' | 'enforce'
  /** Whether this request is permitted under the target's current mode. */
  allowed: boolean
  /** What enforcement would do to this request — the Log-only preview. */
  wouldBlock: boolean
  /** The label (or range) of the rule that let it through, if any. */
  matchedRule: string
  exempt: boolean
}

type GuardSource = 'login' | 'page' | 'api'

/**
 * Evaluates the current request against the allowlist and records the decision.
 *
 * The IP comes from the proxy headers (`resolveClientIp`) — never from the browser — and the
 * evaluation itself lives in the database (`public.ip_guard`), so the app and the
 * row-level gate can never disagree about the verdict.
 *
 * The single-purpose RPC is granted to service_role only: a signed-in user cannot read the
 * allowlist, and cannot write audit rows claiming a decision that was never made.
 *
 * Never throws: a failure here must not break sign-in, chat, push or routing. Returns null
 * when no verdict could be obtained, which callers must treat as "carry on".
 */
export async function guardIpAccess({
  request,
  userId,
  path,
  source,
}: {
  request: Request
  userId: string
  path: string
  source: GuardSource
}): Promise<IpGuardVerdict | null> {
  const service = createServiceClient()
  if (!service) {
    console.warn('[ip-access] SUPABASE_SERVICE_ROLE_KEY is not set, so access decisions cannot be recorded.')
    return null
  }

  const { ip, evidence } = resolveClientIp(request.headers)

  try {
    const { data, error } = await service.rpc('ip_guard', {
      p_user_id: userId,
      p_ip: ip,
      p_path: path.slice(0, 300),
      p_source: source,
      p_user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300) || null,
      // Only the IP headers. Cookies and authorization are never captured.
      p_headers: evidence,
    })
    if (error) {
      console.error('[ip-access] recording the decision failed:', error.code ?? 'unknown', error.message)
      return null
    }
    if (!data || typeof data !== 'object') return null

    const verdict = data as Record<string, unknown>
    return {
      ip: typeof verdict.ip === 'string' ? verdict.ip : ip,
      mode: verdict.mode === 'enforce' || verdict.mode === 'log_only' ? verdict.mode : 'off',
      allowed: verdict.allowed !== false,
      wouldBlock: verdict.would_block === true,
      matchedRule: typeof verdict.matched_rule === 'string' ? verdict.matched_rule : '',
      exempt: verdict.exempt === true,
    }
  } catch (error) {
    console.error('[ip-access] the access check failed:', error instanceof Error ? error.name : 'unknown error')
    return null
  }
}
