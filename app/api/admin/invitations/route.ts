import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/admin'

const MISSING_TABLE = 'The invitations table is not installed yet. Run supabase/schema.sql.'

function tableError(error: { code?: string; message: string }, action: 'access' | 'create' | 'update') {
  if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ error: MISSING_TABLE }, { status: 503 })
  const verb = action === 'access' ? 'access' : action === 'create' ? 'create' : 'update'
  return NextResponse.json({ error: `Unable to ${verb} invitations: ${error.message}` }, { status: 500 })
}

export async function GET() {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const { data, error } = await context.supabase
    .from('invitations')
    .select('id, email, code, home_name, role, expires_at, accepted_at, created_at')
    .order('created_at', { ascending: false })
  if (error) return tableError(error, 'access')
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const role = String(body?.role ?? 'Authorized partner')
  const homeName = String(body?.homeName ?? (role.toLowerCase() === 'pharmacy' ? "Henderson's Pharmacy" : 'Maple Grove LTC · Wing B'))
  const code = `HM-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
  const { data, error } = await context.supabase
    .from('invitations')
    .insert({
      email,
      code,
      created_by: context.userId,
      home_name: homeName,
      role,
    })
    .select('code, email, expires_at')
    .single()
  if (error) return tableError(error, 'create')
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const { id } = await request.json().catch(() => ({ id: '' }))
  if (!id) return NextResponse.json({ error: 'An invitation id is required.' }, { status: 400 })

  const { error } = await context.supabase
    .from('invitations')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return tableError(error, 'update')
  return NextResponse.json({ ok: true })
}
