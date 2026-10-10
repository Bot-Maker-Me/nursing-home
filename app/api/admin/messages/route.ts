import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return { error: NextResponse.json({ error: 'Admin data access is not configured.' }, { status: 503 }) }
  return { client: createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey) }
}

export async function GET() {
  const result = await requireAdmin()
  if ('error' in result) return result.error
  const { data, error } = await result.client.from('portal_messages').select('id, user_id, sender_role, sender_name, body, created_at').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.code === '42P01' || error.code === 'PGRST205' ? 'The portal_messages table is not installed in Supabase yet. Apply the portal schema migration.' : `Unable to load messages: ${error.message}` }, { status: 503 })
  return NextResponse.json(data ?? [])
}

export async function DELETE(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error
  const body = await request.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return NextResponse.json({ error: 'A member is required.' }, { status: 400 })
  const { error } = await result.client.from('portal_messages').delete().eq('user_id', userId)
  if (error) return NextResponse.json({ error: 'Messages could not be cleared.' }, { status: 503 })
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error
  const body = await request.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!userId || !message || message.length > 4000) return NextResponse.json({ error: 'A member and message are required.' }, { status: 400 })
  const { data, error } = await result.client.from('portal_messages').insert({ user_id: userId, sender_role: 'pharmacy', sender_name: 'Henderson’s Pharmacy', body: message }).select('id, user_id, sender_role, sender_name, body, created_at').single()
  if (error) return NextResponse.json({ error: error.code === '42P01' || error.code === 'PGRST205' ? 'The portal_messages table is not installed in Supabase yet. Apply the portal schema migration.' : `Message could not be saved: ${error.message}` }, { status: 503 })
  return NextResponse.json(data)
}
