import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/admin'
import { SECTION_MAP, sectionTitle, type SectionKey } from '@/lib/data-sections'

function scopeColumn(scopeType: string) {
  return scopeType === 'pharmacy' ? 'pharmacy_id' : 'home_id'
}

export async function POST(request: Request) {
  const context = await requireAdmin()
  if (!context.admin) return context.response

  const body = await request.json().catch(() => null)
  const section = body?.section as SectionKey
  const scopeType = body?.scopeType === 'pharmacy' ? 'pharmacy' : 'client'
  const scopeId = String(body?.scopeId ?? '')
  const rows = Array.isArray(body?.rows) ? (body.rows as Record<string, unknown>[]) : null

  if (!section || !(section in SECTION_MAP) || !scopeId) {
    return NextResponse.json({ error: 'Select a client or pharmacy and a section.' }, { status: 400 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'The file had no data rows. Include a header row and at least one record.' }, { status: 400 })
  }
  if (rows.length > 2000) {
    return NextResponse.json({ error: 'Import up to 2,000 rows at a time.' }, { status: 400 })
  }

  const def = SECTION_MAP[section]
  const records = rows.map((row) => {
    const payload: Record<string, string> = {}
    for (const column of def.columns) {
      const value = row[column]
      if (value !== undefined && value !== null) payload[column] = String(value).trim()
    }
    return {
      section,
      [scopeColumn(scopeType)]: scopeId,
      title: sectionTitle(def, payload),
      payload,
      created_by: context.userId,
    }
  })

  const { data, error } = await context.supabase.from('managed_records').insert(records).select('id')
  if (error) return NextResponse.json({ error: `Import failed: ${error.message}` }, { status: 503 })
  return NextResponse.json({ inserted: data?.length ?? 0 })
}
