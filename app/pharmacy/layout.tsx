import { redirect } from 'next/navigation'
import { PharmacySidebar } from '@/components/pharmacy/pharmacy-sidebar'
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
      <PharmacySidebar name={name} pharmacyName={profile?.home_name || "Henderson's Pharmacy"} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-12 lg:py-14">{children}</div>
      </main>
    </div>
  )
}
