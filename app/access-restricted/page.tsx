import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Logo } from '@/components/brand/logo'

export const metadata: Metadata = {
  title: 'Access restricted — LTC Portal',
}

/**
 * Shown to a user whose IP is not on their allowlist while their target is in Enforce mode.
 *
 * Deliberately a static page with no data access at all: it must render for a signed-out,
 * restricted visitor, and it must never disclose which addresses would be accepted, which
 * account matched, or how the rule is configured.
 */
export default function AccessRestrictedPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16">
      <Logo />
      <div className="mt-8 w-full max-w-lg border border-hairline bg-paper p-8 shadow-[8px_8px_0_0_rgba(0,0,0,0.12)]">
        <p className="eyebrow flex items-center gap-2 text-forest-soft/80">
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          Access restricted
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-[-0.03em]">
          Access is restricted to your organisation&rsquo;s network. Contact your administrator.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          You have been signed out. If you are working from a new location, ask your administrator to allow it before
          trying again.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-flex h-11 items-center justify-center bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
