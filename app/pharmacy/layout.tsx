import { redirect } from 'next/navigation'
import { PharmacySidebar } from '@/components/pharmacy/pharmacy-sidebar'
import { PushRegistrar } from '@/components/portal/push-registrar'
import { createClient } from '@/lib/supabase/server'

export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, home_name')
    .eq('id', user.id)
    .maybeSingle()

  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role === 'admin') redirect('/admin')
  if (role !== 'pharmacy') redirect('/portal')

  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Pharmacy'

  return (
    <div className="min-h-dvh lg:flex">
      {/* Registers the push service worker at /sw.js for pharmacy staff. Without it this
          console had no worker at all, so a pharmacy device could never receive an alert
          even after subscribing. Renders nothing. */}
      <PushRegistrar />
      <PharmacySidebar name={name} pharmacyName={profile?.home_name || "Henderson's Pharmacy"} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">{children}</div>
      </main>
    </div>
  )
}
