import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/portal/portal-sidebar'
import { getCurrentHome, getCurrentUser, getPortalProfile, getTenantName } from '@/lib/auth'
import { resolveHomeTheme, themeStyle } from '@/lib/home-themes'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const profile = await getPortalProfile()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role === 'pharmacy') redirect('/pharmacy')

  // This home's custom theme — resolved from its `theme` record (or name) and applied to
  // the shell only, so it never leaks into other homes, the pharmacy/admin consoles or
  // the public site.
  const home = await getCurrentHome()
  const homeName = await getTenantName()
  const theme = resolveHomeTheme({ dbTheme: home?.theme, names: [home?.name, homeName] })

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
