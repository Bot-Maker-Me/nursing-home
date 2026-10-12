import { NextResponse } from 'next/server'
import { createAdminClient, requireStaff } from '@/lib/supabase/admin'
import { loadConversations, sendPharmacyReply, startPharmacyThread } from '@/lib/chat-server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function GET() {
  const context = await requireStaff(['pharmacy', 'admin'])
  if (!context.ok) return context.response

  const [result, homesResult] = await Promise.all([
    loadConversations(context.supabase, createAdminClient()),
    context.supabase.from('homes').select('id, name, city').order('name'),
  ])
  if (!result.ok) {
    return NextResponse.json({ error: 'Chat data is not available until the messaging migration is applied.' }, { status: 503 })
  }
  return NextResponse.json({ ...result.data, homes: homesResult.data ?? [] })
}

export async function POST(request: Request) {
  const context = await requireStaff(['pharmacy', 'admin'])
  if (!context.ok) return context.response

  const limitResult = await rateLimit(`pharmacy-chat:${context.userId}`, { limit: 120, windowSeconds: 60 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  const body = await request.json().catch(() => null)
  const threadId = String(body?.threadId ?? '')
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const urgent = Boolean(body?.urgent)

  // Reply to an existing conversation.
  if (threadId) {
    if (!message || message.length > 4000) {
      return NextResponse.json({ error: 'A conversation and message are required.' }, { status: 400 })
    }
    const result = await sendPharmacyReply(context.supabase, { threadId, message, urgent })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === 'not_found' ? 'Conversation not found.' : 'Message could not be sent.' },
        { status: result.reason === 'not_found' ? 404 : 503 },
      )
    }
    return NextResponse.json({ message: result.data })
  }

  // Start a new conversation with a nursing home.
  const homeId = String(body?.homeId ?? '')
  const subject = String(body?.subject ?? '').trim().slice(0, 120) || 'New conversation'
  const residentRef = String(body?.residentRef ?? '').trim().slice(0, 40)
  if (!homeId || !message || message.length > 4000) {
    return NextResponse.json({ error: 'Choose a nursing home and write a message.' }, { status: 400 })
  }
  const result = await startPharmacyThread(context.supabase, {
    homeId,
    subject,
    residentRef,
    message,
    urgent,
    userId: context.userId,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === 'not_found' ? 'That nursing home could not be found.' : 'Conversation could not be started.' },
      { status: result.reason === 'not_found' ? 404 : 503 },
    )
  }
  return NextResponse.json({ thread: result.data })
}
