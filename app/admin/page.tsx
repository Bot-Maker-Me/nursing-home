import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TeamConsole } from '@/components/admin/team-console'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: "Team console — Henderson's Pharmacy",
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in?next=/admin')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role === 'pharmacy') redirect('/pharmacy')
  if (role !== 'admin') redirect('/portal')

  return <TeamConsole />
}
