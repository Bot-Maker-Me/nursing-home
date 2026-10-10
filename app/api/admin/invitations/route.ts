import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ayvpdpthxwplbsmhpbva.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase() !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const code = `HM-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
  const { data, error } = await getAdminClient().from('invitations').insert({
    email,
    code,
    created_by: user.id,
    home_name: String(body.homeName ?? 'Maple Grove LTC · Wing B'),
    role: String(body.role ?? 'Authorized partner'),
  }).select('code, email, expires_at').single()

  if (error) return NextResponse.json({ error: error.code === '42P01' || error.code === 'PGRST205' ? 'The invitations table is not installed in Supabase yet. Apply the portal schema migration.' : `Unable to create invitation: ${error.message}` }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase() !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await getAdminClient().from('invitations').select('id, email, code, home_name, role, expires_at, accepted_at, created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.code === '42P01' || error.code === 'PGRST205' ? 'The invitations table is not installed in Supabase yet. Apply the portal schema migration.' : `Unable to load invitations: ${error.message}` }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase() !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await request.json()
  const { error } = await getAdminClient().from('invitations').update({ expires_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Unable to revoke invitation.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
