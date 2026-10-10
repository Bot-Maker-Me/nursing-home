import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('portal_messages').select('id, sender_role, sender_name, body, created_at').eq('user_id', user.id).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: 'Messages are not available until the Supabase migration is applied.' }, { status: 503 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > 4000) return NextResponse.json({ error: 'Enter a message up to 4,000 characters.' }, { status: 400 })
  const senderName = String(user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Home team').slice(0, 120)
  const { data, error } = await supabase.from('portal_messages').insert({ user_id: user.id, sender_role: 'home', sender_name: senderName, body: message }).select('id, sender_role, sender_name, body, created_at').single()
  if (error) return NextResponse.json({ error: 'Messages are not available until the Supabase migration is applied.' }, { status: 503 })
  return NextResponse.json(data)
}
