import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user }
}

export async function GET() {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const [threadsResponse, messagesResponse] = await Promise.all([
    result.supabase.from('chat_threads').select('id, subject, resident_ref, urgent, home_id, created_by, last_message_at, created_at').order('last_message_at', { ascending: false }),
    result.supabase.from('portal_messages').select('id, thread_id, sender_role, sender_name, body, urgent, read_at, created_at').order('created_at', { ascending: true }),
  ])
  if (threadsResponse.error || messagesResponse.error) {
    return NextResponse.json({ error: 'Chat data is not available until the messaging migration is applied.' }, { status: 503 })
  }

  // Best-effort member labels via the service-role client (admin-only route).
  const members: Record<string, { name: string; email: string; home: string }> = {}
  const service = serviceClient()
  if (service) {
    const { data } = await service.from('profiles').select('id, full_name, home_name')
    for (const profile of data ?? []) {
      members[profile.id] = { name: profile.full_name || 'Portal user', email: '', home: profile.home_name || '' }
    }
  }

  return NextResponse.json({
    threads: (threadsResponse.data ?? []).map((thread) => ({
      ...thread,
      member: members[thread.created_by] ?? null,
    })),
    messages: messagesResponse.data ?? [],
  })
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const body = await request.json().catch(() => null)
  const threadId = String(body?.threadId ?? '')
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const urgent = Boolean(body?.urgent)
  if (!threadId || !message || message.length > 4000) {
    return NextResponse.json({ error: 'A conversation and message are required.' }, { status: 400 })
  }

  const { data: thread, error: threadError } = await result.supabase
    .from('chat_threads')
    .select('id, created_by')
    .eq('id', threadId)
    .maybeSingle()
  if (threadError || !thread) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

  const { data, error } = await result.supabase
    .from('portal_messages')
    .insert({
      user_id: thread.created_by,
      thread_id: threadId,
      sender_role: 'pharmacy',
      sender_name: 'Henderson’s Pharmacy',
      body: message,
      urgent,
    })
    .select('id, thread_id, sender_role, sender_name, body, urgent, read_at, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Message could not be sent.' }, { status: 503 })

  await result.supabase
    .from('chat_threads')
    .update({ last_message_at: new Date().toISOString(), urgent: false })
    .eq('id', threadId)
  await result.supabase
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('sender_role', 'home')
    .is('read_at', null)

  return NextResponse.json(data)
}
