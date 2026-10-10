import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: threads, error } = await supabase
    .from('chat_threads')
    .select('id, subject, resident_ref, urgent, home_id, last_message_at, created_at')
    .order('last_message_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Chat is not ready until the messaging migration is applied.' }, { status: 503 })

  const ids = (threads ?? []).map((thread) => thread.id)
  const previews: Record<string, string> = {}
  const unread: Record<string, number> = {}

  if (ids.length > 0) {
    const { data: messages } = await supabase
      .from('portal_messages')
      .select('thread_id, body, created_at, sender_role, read_at')
      .in('thread_id', ids)
      .order('created_at', { ascending: true })
    for (const message of messages ?? []) {
      if (!message.thread_id) continue
      previews[message.thread_id] = message.body
      if (message.sender_role !== 'home' && !message.read_at) {
        unread[message.thread_id] = (unread[message.thread_id] ?? 0) + 1
      }
    }
  }

  return NextResponse.json(
    (threads ?? []).map((thread) => ({ ...thread, preview: previews[thread.id] ?? '', unread: unread[thread.id] ?? 0 })),
  )
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const subject = String(body?.subject ?? '').trim().slice(0, 120) || 'New conversation'
  const residentRef = String(body?.residentRef ?? '').trim().slice(0, 40)
  const urgent = Boolean(body?.urgent)
  const firstMessage = typeof body?.message === 'string' ? body.message.trim() : ''

  const { data: profile } = await supabase.from('profiles').select('home_id').eq('id', user.id).maybeSingle()

  const { data: thread, error } = await supabase
    .from('chat_threads')
    .insert({ subject, resident_ref: residentRef, urgent, home_id: profile?.home_id ?? null, created_by: user.id })
    .select('id, subject, resident_ref, urgent, home_id, last_message_at, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Chat is not ready until the messaging migration is applied.' }, { status: 503 })

  if (firstMessage) {
    const senderName = String(user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Home team').slice(0, 120)
    await supabase
      .from('portal_messages')
      .insert({ user_id: user.id, thread_id: thread.id, sender_role: 'home', sender_name: senderName, body: firstMessage, urgent })
  }

  return NextResponse.json(thread)
}
