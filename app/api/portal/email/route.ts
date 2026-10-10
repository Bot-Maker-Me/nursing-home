import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PHARMACY_EMAIL = process.env.PHARMACY_EMAIL ?? 'pharmacy@hendersonsportal.ca'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const subject = String(body?.subject ?? '').trim().slice(0, 160) || 'Portal message'
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'Write a message before sending an email.' }, { status: 400 })

  const apiKey = process.env.RESEND_API_KEY
  // Not configured: hand the client a mailto payload so the flow still works.
  if (!apiKey) {
    return NextResponse.json({ configured: false, to: PHARMACY_EMAIL, subject, body: message })
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "Henderson's Portal <onboarding@resend.dev>",
      to: [PHARMACY_EMAIL],
      reply_to: user.email ?? undefined,
      subject,
      text: `${message}\n\n— Sent from the Henderson's Pharmacy client portal`,
    }),
  }).catch(() => null)

  if (!response?.ok) return NextResponse.json({ error: 'Email could not be sent. Please try again.' }, { status: 502 })
  return NextResponse.json({ configured: true, ok: true })
}
