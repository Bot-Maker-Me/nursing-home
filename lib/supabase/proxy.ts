import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ACCESS_RESTRICTED_MESSAGE, guardIpAccess } from '@/lib/ip-access'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env'

/**
 * Paths that must keep working for a restricted user, or they could never be told anything
 * and could never sign back in from an allowed address.
 *
 * `/api/auth/*` covers the sign-in route (which refuses the attempt itself, with the same
 * wording), `/auth/*` the email-confirmation callback, and `/api/health` the liveness probe.
 * `/sw.js` and `/manifest.json` are fetched by the browser on the user's behalf, so blocking
 * them would break the push worker rather than protect anything.
 */
const EXEMPT_PATHS = new Set(['/sign-in', '/access-restricted', '/api/health', '/sw.js', '/manifest.json'])

function isGated(pathname: string) {
  if (EXEMPT_PATHS.has(pathname)) return false
  if (pathname.startsWith('/api/auth/') || pathname.startsWith('/auth/')) return false
  return true
}

/**
 * Signs the caller out of Supabase by expiring every session cookie on this response. Chunked
 * sessions use `sb-<ref>-auth-token.0`, `.1`, …, so the prefix is matched rather than a single
 * exact name.
 */
function clearSessionCookies(response: NextResponse, request: NextRequest) {
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith('sb-') && name.includes('-auth-token')) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 })
    }
  }
  return response
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // IP allowlist: every authenticated page and API request is evaluated against the caller's
    // rules (their own, their nursing home's, their pharmacy's) and recorded, once, by
    // `public.ip_guard`. It never throws and never changes the response, so sign-in, chat,
    // push and routing keep working even if the allowlist tables are unreachable — a failure
    // to reach the check is treated as "carry on", never as "block everyone".
    const verdict = await guardIpAccess({
      request,
      userId: user.id,
      path: request.nextUrl.pathname,
      source: request.nextUrl.pathname.startsWith('/api/') ? 'api' : 'page',
    })

    // A verdict of null means the check could not run (no service-role key, or the database
    // was unreachable). The database-level gate still applies to any direct Supabase call.
    if (verdict && !verdict.allowed && isGated(request.nextUrl.pathname)) {
      // The wording is fixed and says nothing about which addresses are accepted, which
      // account matched, or how the rule is configured.
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return clearSessionCookies(
          NextResponse.json({ error: ACCESS_RESTRICTED_MESSAGE, restricted: true }, { status: 403 }),
          request,
        )
      }

      const restricted = request.nextUrl.clone()
      restricted.pathname = '/access-restricted'
      restricted.search = ''
      return clearSessionCookies(NextResponse.redirect(restricted), request)
    }
  }

  return response
}
