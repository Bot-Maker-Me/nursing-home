import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [homes, pharmacies] = await Promise.all([
    supabase.from('homes').select('id, name, city, status').order('name'),
    supabase.from('pharmacies').select('id, name, phone, email').order('name'),
  ])
  if (homes.error || pharmacies.error) {
    return NextResponse.json({ error: 'Clients and pharmacies are not available until the scoping migration is applied.' }, { status: 503 })
  }
  return NextResponse.json({ homes: homes.data ?? [], pharmacies: pharmacies.data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const type = body?.type === 'pharmacy' ? 'pharmacy' : 'client'
  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })

  if (type === 'pharmacy') {
    const { data, error } = await supabase
      .from('pharmacies')
      .insert({ name, phone: String(body?.phone ?? '').trim(), email: String(body?.email ?? '').trim() })
      .select('id, name, phone, email')
      .single()
    if (error) return NextResponse.json({ error: 'Unable to create pharmacy.' }, { status: 500 })
    return NextResponse.json({ type, record: data })
  }

  const { data, error } = await supabase
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
  if (error) return NextResponse.json({ error: 'Unable to create client.' }, { status: 500 })
  return NextResponse.json({ type, record: data })
}
