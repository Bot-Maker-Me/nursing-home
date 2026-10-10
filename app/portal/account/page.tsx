import { Card, PageHeader } from '@/components/portal/page-header'
import { createClient } from '@/lib/supabase/server'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, home_name')
    .eq('id', user?.id ?? '')
    .maybeSingle()

  const name = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Portal user'
  const homeName = profile?.home_name || user?.user_metadata?.home_name || 'Assigned home'
  const assignedPharmacist = user?.user_metadata?.assigned_pharmacist || 'Not assigned'
  const role = profile?.role || 'Authorized partner'

  return (
    <>
      <PageHeader crumb={`${homeName} / Account`} title="Account" description="Your profile and assigned pharmacy support." />
      <Card className="mt-8" eyebrow="Profile" title={name}>
        <dl className="divide-y divide-hairline border-y border-hairline text-sm">
          {[
            ['Role', role],
            ['Home', homeName],
            ['Assigned pharmacist', assignedPharmacist],
            ['Email', user?.email ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Use the sign-out control in the sidebar to end your session on this device.</p>
      </Card>
    </>
  )
}
