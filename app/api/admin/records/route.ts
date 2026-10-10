import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SECTION_MAP, sectionTitle, type SectionKey } from '@/lib/data-sections'

function scopeColumn(scopeType: string) {
  return scopeType === 'pharmacy' ? 'pharmacy_id' : 'home_id'
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user }
}

export async function GET(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const url = new URL(request.url)
  const scopeType = url.searchParams.get('scopeType') === 'pharmacy' ? 'pharmacy' : 'client'
  const scopeId = url.searchParams.get('scopeId') ?? ''
  const section = url.searchParams.get('section') as SectionKey | null
  if (!scopeId || !section || !(section in SECTION_MAP)) {
    return NextResponse.json({ error: 'Select a client or pharmacy and a section.' }, { status: 400 })
  }

  const { data, error } = await result.supabase
    .from('managed_records')
    .select('id, section, title, payload, created_at')
    .eq('section', section)
    .eq(scopeColumn(scopeType), scopeId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load records.' }, { status: 503 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const body = await request.json().catch(() => null)
  const section = body?.section as SectionKey
  const scopeType = body?.scopeType === 'pharmacy' ? 'pharmacy' : 'client'
  const scopeId = String(body?.scopeId ?? '')
  if (!section || !(section in SECTION_MAP) || !scopeId) {
    return NextResponse.json({ error: 'Select a client or pharmacy and a section.' }, { status: 400 })
  }

  const def = SECTION_MAP[section]
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}
  const { data, error } = await result.supabase
    .from('managed_records')
    .insert({
      section,
      [scopeColumn(scopeType)]: scopeId,
      title: sectionTitle(def, payload),
      payload,
      created_by: result.user.id,
    })
    .select('id, section, title, payload, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Unable to save this record.' }, { status: 503 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'A record id is required.' }, { status: 400 })
  const { error } = await result.supabase.from('managed_records').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Unable to delete this record.' }, { status: 503 })
  return NextResponse.json({ ok: true })
}
