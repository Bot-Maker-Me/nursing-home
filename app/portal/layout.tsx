import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/portal/portal-sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, home_name')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="min-h-dvh lg:flex">
      <PortalSidebar
        profile={{
          name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Partner',
          role: profile?.role || 'Authorized partner',
          homeName: profile?.home_name || 'Maple Grove LTC · Wing B',
        }}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-12 lg:py-14">{children}</div>
      </main>
    </div>
  )
}
