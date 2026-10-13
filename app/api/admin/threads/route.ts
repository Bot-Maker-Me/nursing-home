import { NextResponse } from 'next/server'
import { createAdminClient, requireAdmin } from '@/lib/supabase/admin'
import { loadConversations, sendPharmacyReply, setThreadArchived } from '@/lib/chat-server'

export async function GET() {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const result = await loadConversations(context.supabase, createAdminClient())
  if (!result.ok) {
    return NextResponse.json({ error: 'Chat data is not available until the messaging migration is applied.' }, { status: 503 })
  }
  return NextResponse.json(result.data)
}

export async function POST(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const body = await request.json().catch(() => null)
  const threadId = String(body?.threadId ?? '')
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const urgent = Boolean(body?.urgent)
  if (!threadId || !message || message.length > 4000) {
    return NextResponse.json({ error: 'A conversation and message are required.' }, { status: 400 })
  }

  const result = await sendPharmacyReply(context.supabase, { threadId, message, urgent })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === 'not_found' ? 'Conversation not found.' : 'Message could not be sent.' },
      { status: result.reason === 'not_found' ? 404 : 503 },
    )
  }
  return NextResponse.json(result.data)
}

export async function PATCH(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const body = await request.json().catch(() => null)
  const threadId = String(body?.threadId ?? '')
  if (!threadId) return NextResponse.json({ error: 'A conversation is required.' }, { status: 400 })

  const result = await setThreadArchived(context.supabase, { threadId, archived: Boolean(body?.archived) })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === 'not_found' ? 'Conversation not found.' : 'Conversation could not be updated.' },
      { status: result.reason === 'not_found' ? 404 : 503 },
    )
  }
  return NextResponse.json({ ok: true })
}
