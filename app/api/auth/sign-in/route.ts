import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  const hasTokens = typeof body?.access_token === 'string' && typeof body?.refresh_token === 'string'
  if (!hasTokens && (!email || !password)) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ayvpdpthxwplbsmhpbva.supabase.co'
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.JWT
  if (!publishableKey) return NextResponse.json({ error: 'Supabase Auth is not configured.' }, { status: 503 })

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

  const metadataRole = typeof data.user.app_metadata?.role === 'string' ? data.user.app_metadata.role.toLowerCase() : ''
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  const profileRole = typeof profile?.role === 'string' ? profile.role.toLowerCase() : ''
  const role = profileRole || metadataRole
  return NextResponse.json({ redirect: role === 'admin' ? '/admin' : '/portal' })
}
