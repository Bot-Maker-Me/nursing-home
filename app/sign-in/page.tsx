import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { AuthTicket } from '@/components/auth/auth-ticket'
import { resolveAuthTheme, themeStyle } from '@/lib/home-themes'

export const metadata: Metadata = {
  title: "Sign in — Henderson's Pharmacy Portal",
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; home?: string }>
}) {
  const { mode, next, home } = await searchParams
  const redirectTo = next === '/admin' ? '/admin' : '/portal'

  // The home's custom theme, applied to the sign-in shell so it matches the portal it
  // leads into. A `?home=<slug>` link picks a specific home; otherwise the app's
  // registered home theme is used. Scoped to this route only.
  const theme = resolveAuthTheme(home)

  return (
    <div
      data-home-theme={theme?.slug}
      style={theme ? themeStyle(theme) : undefined}
      className="relative min-h-dvh overflow-hidden bg-forest"
    >
      <p
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 left-0 select-none whitespace-nowrap text-[22vw] font-bold leading-none tracking-[-0.06em] text-white/[0.04]"
      >
        17:00 · 21:00
      </p>
      <header className="relative mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Back to home">
          <Logo tone="light" />
        </Link>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-cream/70 hover:text-cream">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
      </header>
      <main className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pt-6 pb-20 md:pt-12">
        <AuthTicket initialMode={mode === 'activate' ? 'activate' : 'signin'} redirectTo={redirectTo} />
        {redirectTo === '/admin' && <p className="mt-4 text-center text-sm text-cream/70">Administrator sign-in · use the email assigned the admin role.</p>}
      </main>
    </div>
  )
}
