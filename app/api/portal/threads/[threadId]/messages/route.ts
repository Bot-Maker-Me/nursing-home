import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ threadId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { threadId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('portal_messages')
    .select('id, sender_role, sender_name, body, urgent, read_at, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: 'Messages are not available.' }, { status: 503 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: RouteContext) {
  const { threadId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitResult = await rateLimit(`messages:${user.id}`, { limit: 60, windowSeconds: 60 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  const body = await request.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const urgent = Boolean(body?.urgent)
  if (!message || message.length > 4000) return NextResponse.json({ error: 'Enter a message up to 4,000 characters.' }, { status: 400 })

  const senderName = String(user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Home team').slice(0, 120)
  const { data, error } = await supabase
    .from('portal_messages')
    .insert({ user_id: user.id, thread_id: threadId, sender_role: 'home', sender_name: senderName, body: message, urgent })
    .select('id, sender_role, sender_name, body, urgent, read_at, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Message could not be sent.' }, { status: 503 })

  await supabase
    .from('chat_threads')
    .update({ last_message_at: new Date().toISOString(), ...(urgent ? { urgent: true } : {}) })
    .eq('id', threadId)

  return NextResponse.json(data)
}

export async function PATCH(_request: Request, { params }: RouteContext) {
  const { threadId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .neq('sender_role', 'home')
    .is('read_at', null)
  if (error) return NextResponse.json({ error: 'Unable to update read receipts.' }, { status: 503 })
  return NextResponse.json({ ok: true })
}
