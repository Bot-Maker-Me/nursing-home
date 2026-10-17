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
