import { redirect } from 'next/navigation'
import { Card, PageHeader } from '@/components/portal/page-header'
import { createClient } from '@/lib/supabase/server'

const sessions = [
  { device: 'Nursing station · Wing B desktop', where: 'Hamilton, ON', when: 'Current session' },
  { device: 'iPad · Floor 2 cart', where: 'Hamilton, ON', when: 'Yesterday 21:14' },
]

export default async function AccountPage() {
  redirect('/portal')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('full_name, role, home_name').eq('id', user?.id ?? '').maybeSingle()
  const name = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Portal user'
  const homeName = profile?.home_name || user?.user_metadata?.home_name || 'Assigned home'
  const assignedPharmacist = user?.user_metadata?.assigned_pharmacist || 'Not assigned'
  const role = profile?.role || 'Authorized partner'

  return (
    <>
      <PageHeader crumb={`${homeName} / Account`} title="Account" description="Your profile and assigned pharmacy support." />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Profile" title={name}>
          <dl className="divide-y divide-hairline border-y border-hairline text-sm">
            {[
              ['Role', role],
              ['Home', homeName],
              ['Assigned pharmacist', assignedPharmacist],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card eyebrow="Security" title="Active sessions" meta={`${sessions.length} devices`}>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {sessions.map((s) => (
              <li key={s.device} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{s.device}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.where} · {s.when}
                  </span>
                </span>
                <button type="button" className="text-xs font-medium text-terracotta">
                  Sign out
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
