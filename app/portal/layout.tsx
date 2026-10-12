import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/portal/portal-sidebar'
import { createClient } from '@/lib/supabase/server'
import { resolveHomeTheme, themeStyle } from '@/lib/home-themes'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, home_name, home_id')
    .eq('id', user.id)
    .maybeSingle()

  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role === 'pharmacy') redirect('/pharmacy')

  const homeName = profile?.home_name || user.user_metadata?.home_name || 'Maple Grove LTC · Wing B'

  // Resolve this home's custom theme. The `theme` column may not exist on older
  // databases, so fall back to a name-only lookup rather than failing the page.
  let dbTheme: unknown = null
  let storedHomeName: string | null = null
  if (profile?.home_id) {
    const withTheme = await supabase
      .from('homes')
      .select('name, theme')
      .eq('id', profile.home_id)
      .maybeSingle()
    if (withTheme.error) {
      const withoutTheme = await supabase.from('homes').select('name').eq('id', profile.home_id).maybeSingle()
      storedHomeName = withoutTheme.data?.name ?? null
    } else {
      storedHomeName = withTheme.data?.name ?? null
      dbTheme = withTheme.data?.theme ?? null
    }
  }

  const theme = resolveHomeTheme({ dbTheme, names: [storedHomeName, homeName] })

  return (
    <div
      className="min-h-dvh bg-background lg:flex"
      data-home-theme={theme?.slug}
      style={theme ? themeStyle(theme) : undefined}
    >
      <PortalSidebar
        profile={{
          name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Partner',
          role: profile?.role || 'Authorized partner',
          homeName,
        }}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">{children}</div>
      </main>
    </div>
  )
}
