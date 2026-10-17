import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { guardIpAccess } from '@/lib/ip-access'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env'

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

  // IP allowlist: every authenticated page and API request is evaluated against the caller's
  // rules and recorded, once, by `public.ip_guard`. This is the one chokepoint that covers
  // both the portal and the console, and it reports what ENFORCEMENT would do without ever
  // blocking anyone in Log-only mode — so a target can be rehearsed safely.
  //
  // It never throws and never changes the response: sign-in, chat, push and routing must keep
  // working even if the allowlist tables are unreachable.
  if (user) {
    await guardIpAccess({
      request,
      userId: user.id,
      path: request.nextUrl.pathname,
      source: request.nextUrl.pathname.startsWith('/api/') ? 'api' : 'page',
    })
  }

  return response
}
