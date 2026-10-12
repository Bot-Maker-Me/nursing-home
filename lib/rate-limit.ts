import { NextResponse } from 'next/server'

/**
 * Lightweight, dependency-free rate limiter.
 *
 * Uses Upstash Redis over its REST API when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are configured (works from serverless/edge with no npm
 * dependency and no persistent connections). When they are not configured it fails OPEN
 * (allows the request), so nothing breaks before you wire a store in.
 *
 * Swap in `@upstash/ratelimit` or Vercel KV later — the call signature here stays put.
 */
export type RateLimitResult = { ok: boolean; limit: number; remaining: number; retryAfter: number }

const REST_URL = process.env.UPSTASH_REDIS_REST_URL
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/** Best-effort client IP for limiting unauthenticated traffic. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function rateLimit(
  identifier: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const allow: RateLimitResult = { ok: true, limit, remaining: limit, retryAfter: 0 }
  if (!REST_URL || !REST_TOKEN) return allow

  try {
    const response = await fetch(`${REST_URL}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
      // INCR the counter, set the TTL only on the first hit, then read the TTL back.
      body: JSON.stringify([
        ['INCR', `ratelimit:${identifier}`],
        ['EXPIRE', `ratelimit:${identifier}`, String(windowSeconds), 'NX'],
        ['TTL', `ratelimit:${identifier}`],
      ]),
      cache: 'no-store',
    })
    if (!response.ok) return allow

    const payload = (await response.json()) as Array<{ result?: number }>
    const count = Number(payload?.[0]?.result ?? 0)
    const ttl = Number(payload?.[2]?.result ?? windowSeconds)
    return {
      ok: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfter: ttl > 0 ? ttl : windowSeconds,
    }
  } catch {
    // Never let the limiter take the app down.
    return allow
  }
}

/** Standard 429 response with useful headers. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, result.retryAfter)),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  )
}
