import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const [homes, pharmacies] = await Promise.all([
    context.supabase.from('homes').select('id, name, city, status').order('name'),
    context.supabase.from('pharmacies').select('id, name, phone, email').order('name'),
  ])
  const failure = homes.error ?? pharmacies.error
  if (failure) {
    return NextResponse.json({ error: `Clients and pharmacies could not be loaded: ${failure.message}` }, { status: 503 })
  }
  return NextResponse.json({ homes: homes.data ?? [], pharmacies: pharmacies.data ?? [] })
}

export async function POST(request: Request) {
  const context = await requireAdmin()
  if (!context.ok) return context.response

  const body = await request.json().catch(() => null)
  const type = body?.type === 'pharmacy' ? 'pharmacy' : 'client'
  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })

  if (type === 'pharmacy') {
    const { data, error } = await context.supabase
      .from('pharmacies')
      .insert({ name, phone: String(body?.phone ?? '').trim(), email: String(body?.email ?? '').trim() })
      .select('id, name, phone, email')
      .single()
    if (error) return NextResponse.json({ error: `Unable to create pharmacy: ${error.message}` }, { status: 500 })
    return NextResponse.json({ type, record: data })
  }

  const { data, error } = await context.supabase
    .from('homes')
    .insert({
      name,
      city: String(body?.city ?? '').trim(),
      pharmacist: String(body?.pharmacist ?? '').trim(),
      pharmacist_phone: String(body?.pharmacistPhone ?? '').trim(),
      after_hours: String(body?.afterHours ?? '').trim(),
      status: body?.status === 'suspended' ? 'suspended' : 'active',
    })
    .select('id, name, city, status')
    .single()
  if (error) return NextResponse.json({ error: `Unable to create client: ${error.message}` }, { status: 500 })
  return NextResponse.json({ type, record: data })
}
