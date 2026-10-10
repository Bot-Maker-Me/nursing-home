import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ayvpdpthxwplbsmhpbva.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: Request) {
  const { code, email, userId, fullName } = await request.json()
  const normalizedCode = String(code ?? '').trim().toUpperCase()
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  const { data: invitation, error } = await getAdminClient().from('invitations').select('id, email, role, home_name, expires_at, accepted_at').eq('code', normalizedCode).maybeSingle()
  if (error || !invitation || invitation.email.toLowerCase() !== normalizedEmail || invitation.accepted_at || new Date(invitation.expires_at) < new Date()) return NextResponse.json({ error: 'That invitation code is invalid, expired, or already used.' }, { status: 400 })
  if (!userId) return NextResponse.json({ valid: true, homeName: invitation.home_name, role: invitation.role })
  const { error: profileError } = await getAdminClient().from('profiles').upsert({ id: userId, full_name: String(fullName ?? ''), role: invitation.role, home_name: invitation.home_name }, { onConflict: 'id' })
  if (profileError) return NextResponse.json({ error: 'Account created but could not be linked to the invitation.' }, { status: 500 })
  const { error: acceptError } = await getAdminClient().from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invitation.id)
  if (acceptError) return NextResponse.json({ error: 'Account created but invitation could not be marked used.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
