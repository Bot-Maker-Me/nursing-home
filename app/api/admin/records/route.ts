import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/admin'
import { SECTION_MAP, sectionTitle, type SectionKey } from '@/lib/data-sections'

function scopeColumn(scopeType: string) {
  return scopeType === 'pharmacy' ? 'pharmacy_id' : 'home_id'
}

export async function GET(request: Request) {
  const context = await requireAdmin()
  if (!context.admin) return context.response

  const url = new URL(request.url)
  const scopeType = url.searchParams.get('scopeType') === 'pharmacy' ? 'pharmacy' : 'client'
  const scopeId = url.searchParams.get('scopeId') ?? ''
  const section = url.searchParams.get('section') as SectionKey | null
  if (!scopeId || !section || !(section in SECTION_MAP)) {
    return NextResponse.json({ error: 'Select a client or pharmacy and a section.' }, { status: 400 })
  }

  const { data, error } = await context.supabase
    .from('managed_records')
    .select('id, section, title, payload, created_at')
    .eq('section', section)
    .eq(scopeColumn(scopeType), scopeId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: `Unable to load records: ${error.message}` }, { status: 503 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const context = await requireAdmin()
  if (!context.admin) return context.response

  const body = await request.json().catch(() => null)
  const section = body?.section as SectionKey
  const scopeType = body?.scopeType === 'pharmacy' ? 'pharmacy' : 'client'
  const scopeId = String(body?.scopeId ?? '')
  if (!section || !(section in SECTION_MAP) || !scopeId) {
    return NextResponse.json({ error: 'Select a client or pharmacy and a section.' }, { status: 400 })
  }

  const def = SECTION_MAP[section]
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}
  const { data, error } = await context.supabase
    .from('managed_records')
    .insert({
      section,
      [scopeColumn(scopeType)]: scopeId,
      title: sectionTitle(def, payload),
      payload,
      created_by: context.userId,
    })
    .select('id, section, title, payload, created_at')
    .single()
  if (error) return NextResponse.json({ error: `Unable to save this record: ${error.message}` }, { status: 503 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const context = await requireAdmin()
  if (!context.admin) return context.response

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'A record id is required.' }, { status: 400 })
  const { error } = await context.supabase.from('managed_records').delete().eq('id', id)
  if (error) return NextResponse.json({ error: `Unable to delete this record: ${error.message}` }, { status: 503 })
  return NextResponse.json({ ok: true })
}
