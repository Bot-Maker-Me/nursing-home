import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { IpAccessConsole } from '@/components/admin/ip-access-console'
import { Logo } from '@/components/brand/logo'
import { Card, PageHeader } from '@/components/portal/page-header'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Security — IP access · LTC Portal',
}

/**
 * Security › IP access. Admin only: the role is re-checked here even though every API call
 * this page makes verifies it again, so a non-admin never sees the console at all.
 */
export default async function IpAccessPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in?next=/admin/security/ip-access')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role === 'pharmacy') redirect('/pharmacy')
  if (role !== 'admin') redirect('/portal')

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="bg-sidebar px-5 py-6 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-72 lg:shrink-0 lg:flex-col lg:gap-8">
        <Link href="/admin">
          <Logo tone="light" />
        </Link>
        <div>
          <p className="eyebrow text-sidebar-foreground/60">Security</p>
          <p className="mt-3 text-2xl font-semibold text-white">IP access</p>
          <nav className="mt-6 space-y-1 text-sm" aria-label="Admin sections">
            <Link
              href="/admin"
              className="block border-l border-sidebar-border px-3 py-2 text-sidebar-foreground/80 hover:border-[#f0d36b] hover:text-white"
            >
              Back to portal administration
            </Link>
          </nav>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl space-y-8 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
          <PageHeader
            crumb="Security › IP access"
            title="Restrict sign-ins by IP address"
            description="Allow a user, a whole nursing home, or a whole pharmacy to sign in only from the addresses and ranges you list here. A target can hold as many as it needs, and an account is covered by its own rules plus its nursing home's plus its pharmacy's. Start with Log only to see the decisions before anything is blocked."
            aside={
              <Link
                href="/admin"
                className="h-11 shrink-0 border border-hairline px-4 text-sm font-medium leading-[2.75rem] text-muted-foreground hover:bg-cream"
              >
                Portal administration
              </Link>
            }
          />

          <Card eyebrow="How it works" title="Three modes, and one safety net">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="font-medium text-foreground">Off</strong> — no checks at all. Every account starts
                here.
              </li>
              <li>
                <strong className="font-medium text-foreground">Log only</strong> — the server records whether each
                sign-in and page request would have been allowed. Nobody is blocked, and the audit below shows exactly
                what enforcement would do.
              </li>
              <li>
                <strong className="font-medium text-foreground">Enforce</strong> — requests from an address that matches
                no rule are refused, the user is signed out, and direct database calls from that address fail too.
              </li>
              <li>
                Because the block is also enforced by the database itself, it protects every application on this
                database — including the Pharma Portal — and not only this one.
              </li>
              <li>
                Administrators are never restricted, and an empty allowlist never blocks anyone unless you explicitly
                switch on the empty-allowlist block for that target.
              </li>
            </ul>
          </Card>

          <IpAccessConsole />
        </div>
      </main>
    </div>
  )
}
