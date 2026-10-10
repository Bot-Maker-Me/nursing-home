import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MISSING_TABLE = 'The invitations table is not installed yet. Run supabase/schema.sql.'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user }
}

function tableError(error: { code?: string; message: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ error: MISSING_TABLE }, { status: 503 })
  return NextResponse.json({ error: `Unable to access invitations: ${error.message}` }, { status: 500 })
}

export async function GET() {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const { data, error } = await result.supabase
    .from('invitations')
    .select('id, email, code, home_name, role, expires_at, accepted_at, created_at')
    .order('created_at', { ascending: false })
  if (error) return tableError(error)
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const code = `HM-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
  const { data, error } = await result.supabase
    .from('invitations')
    .insert({
      email,
      code,
      created_by: result.user.id,
      home_name: String(body?.homeName ?? 'Maple Grove LTC · Wing B'),
      role: String(body?.role ?? 'Authorized partner'),
    })
    .select('code, email, expires_at')
    .single()
  if (error) return tableError(error)
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const { id } = await request.json().catch(() => ({ id: '' }))
  if (!id) return NextResponse.json({ error: 'An invitation id is required.' }, { status: 400 })

  const { error } = await result.supabase
    .from('invitations')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return tableError(error)
  return NextResponse.json({ ok: true })
}
