import { NextResponse } from 'next/server'
import { ACCESS_RESTRICTED_MESSAGE, guardIpAccess } from '@/lib/ip-access'
import { createClient } from '@/lib/supabase/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  const hasTokens = typeof body?.access_token === 'string' && typeof body?.refresh_token === 'string'
  if (!hasTokens && (!email || !password)) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const supabaseUrl = SUPABASE_URL
  const publishableKey = SUPABASE_ANON_KEY

  const incomingTokens = typeof body?.access_token === 'string' && typeof body?.refresh_token === 'string'
    ? { access_token: body.access_token, refresh_token: body.refresh_token }
    : null
  const tokenResponse = incomingTokens
    ? null
    : await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: publishableKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
      }).catch(() => null)

  if (!incomingTokens && !tokenResponse?.ok) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  const tokens = incomingTokens ?? await tokenResponse!.json()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  if (error || !data.user) return NextResponse.json({ error: 'Unable to establish a secure session.' }, { status: 500 })

  // The allowlist is checked at the moment of sign-in too, so an attempt from a disallowed
  // address is recorded even if the user never loads a page afterwards — and, in Enforce
  // mode, is refused here with the session torn down again. The verdict is always recorded
  // by ip_guard; only the wording below is ever shown, never the accepted addresses.
  const verdict = await guardIpAccess({
    request,
    userId: data.user.id,
    path: '/api/auth/sign-in',
    source: 'login',
  })

  if (verdict && !verdict.allowed) {
    await supabase.auth.signOut()
    console.warn('[ip-access] refused a sign-in from a disallowed address:', {
      ip: verdict.ip,
      mode: verdict.mode,
    })
    return NextResponse.json({ error: ACCESS_RESTRICTED_MESSAGE, restricted: true }, { status: 403 })
  }

  // Log-only rehearsal: the sign-in is allowed, but this address would be refused once the
  // target is switched to Enforce.
  if (verdict?.wouldBlock) {
    console.info('[ip-access] sign-in recorded; enforcement would block this address:', {
      ip: verdict.ip,
      mode: verdict.mode,
    })
  }

  const metadataRole = typeof data.user.app_metadata?.role === 'string' ? data.user.app_metadata.role.toLowerCase() : ''
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  const profileRole = typeof profile?.role === 'string' ? profile.role.toLowerCase() : ''
  const role = profileRole || metadataRole
  const redirect = role === 'admin' ? '/admin' : role === 'pharmacy' ? '/pharmacy' : '/portal'
  return NextResponse.json({ redirect })
}
