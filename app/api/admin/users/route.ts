import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SUPABASE_URL } from '@/lib/supabase/env'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2 ?? ''
const SERVICE_HINT = 'User management needs the SUPABASE_SERVICE_ROLE_KEY environment variable (set it in Vercel and .env.local).'

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, error: 'Unauthorized' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  return role === 'admin' ? { user, error: null } : { user: null, error: 'Forbidden' as const }
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!SERVICE_KEY) return NextResponse.json({ error: SERVICE_HINT }, { status: 503 })

  const service = adminClient()
  const [{ data, error }, { data: profiles }] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 200 }),
    service.from('profiles').select('id, home_id, home_name'),
  ])
  if (error) return NextResponse.json({ error: 'Unable to load portal users.' }, { status: 500 })

  const profileMap = new Map((profiles ?? []).map((row) => [row.id, row]))

  return NextResponse.json(
    data.users
      .filter((candidate) => candidate.id !== user.id)
      .map((candidate) => {
        const row = profileMap.get(candidate.id)
        return {
          id: candidate.id,
          email: candidate.email,
          name: candidate.user_metadata?.full_name ?? candidate.email?.split('@')[0] ?? 'Portal user',
          assignedPharmacist: candidate.user_metadata?.assigned_pharmacist ?? '',
          homeName: row?.home_name ?? candidate.user_metadata?.home_name ?? '',
          homeId: row?.home_id ?? '',
          role: candidate.user_metadata?.portal_role ?? candidate.app_metadata?.role ?? 'Authorized partner',
        }
      }),
  )
}

export async function PATCH(request: Request) {
  const { user, error } = await requireAdmin()
  if (error || !user) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  if (!SERVICE_KEY) return NextResponse.json({ error: SERVICE_HINT }, { status: 503 })

  const body = await request.json()
  const userId = String(body.userId ?? '')
  const assignedPharmacist = String(body.assignedPharmacist ?? '').trim()
  const homeName = String(body.homeName ?? '').trim()
  const homeId = String(body.homeId ?? '').trim()
  if (!userId || !assignedPharmacist) return NextResponse.json({ error: 'User and assigned pharmacist are required.' }, { status: 400 })

  const service = adminClient()
  const result = await service.auth.admin.updateUserById(userId, {
    user_metadata: { assigned_pharmacist: assignedPharmacist, home_name: homeName },
  })
  if (result.error) return NextResponse.json({ error: 'Unable to update the user assignment.' }, { status: 500 })

  const { error: profileError } = await service
    .from('profiles')
    .update({ home_name: homeName, home_id: homeId || null })
    .eq('id', userId)
  if (profileError) return NextResponse.json({ error: 'Auth metadata saved, but the portal profile could not be updated.' }, { status: 503 })
  return NextResponse.json({ ok: true, assignedPharmacist, homeName, homeId })
}
