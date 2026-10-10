import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: 'Unauthorized' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  return role === 'admin' ? { supabase, user, error: null } : { supabase, user: null, error: 'Forbidden' as const }
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: 'Unable to load portal users.' }, { status: 500 })

  return NextResponse.json(data.users
    .filter((candidate) => candidate.id !== user.id)
    .map((candidate) => ({
      id: candidate.id,
      email: candidate.email,
      name: candidate.user_metadata?.full_name ?? candidate.email?.split('@')[0] ?? 'Portal user',
      assignedPharmacist: candidate.user_metadata?.assigned_pharmacist ?? '',
      homeName: candidate.user_metadata?.home_name ?? '',
      role: candidate.user_metadata?.portal_role ?? candidate.app_metadata?.role ?? 'Authorized partner',
    })))
}

export async function PATCH(request: Request) {
  const { user, error } = await requireAdmin()
  if (error || !user) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  const body = await request.json()
  const userId = String(body.userId ?? '')
  const assignedPharmacist = String(body.assignedPharmacist ?? '').trim()
  const homeName = String(body.homeName ?? '').trim()
  if (!userId || !assignedPharmacist) return NextResponse.json({ error: 'User and assigned pharmacist are required.' }, { status: 400 })
  const service = adminClient()
  const result = await service.auth.admin.updateUserById(userId, {
    user_metadata: { assigned_pharmacist: assignedPharmacist, home_name: homeName },
  })
  if (result.error) return NextResponse.json({ error: 'Unable to update the user assignment.' }, { status: 500 })
  const { error: profileError } = await service.from('profiles').update({ home_name: homeName }).eq('id', userId)
  if (profileError) return NextResponse.json({ error: 'Auth metadata saved, but the portal profile could not be updated.' }, { status: 503 })
  return NextResponse.json({ ok: true, assignedPharmacist, homeName })
}
