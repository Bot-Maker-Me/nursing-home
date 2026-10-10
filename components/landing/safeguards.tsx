import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

const items = [
  { k: 'Residency', v: 'Hosted in Canada', d: 'Health information is stored and processed only in Canadian regions.' },
  { k: 'Isolation', v: 'One home, one scope', d: 'Every record is bound to its home, enforced in the database and the API.' },
  { k: 'Identity', v: 'Invite-only access', d: 'Invitation-gated sign-up, idle logout for shared stations, instant deactivation.' },
  { k: 'Audit', v: 'Append-only trail', d: 'Logins, document views, messages and exports are recorded immutably.' },
]

export function Safeguards() {
  return (
    <section id="safeguards" aria-labelledby="safe-heading" className="bg-forest text-cream">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="eyebrow text-[#e48a70]">Safeguards</p>
            <h2 id="safe-heading" className="mt-4 max-w-2xl text-balance text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              Built like it holds health information. Because it does.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-cream/70">
            Designed against PIPEDA and PHIPA, reviewed by a privacy officer before go-live.
          </p>
        </div>
        <dl className="mt-16 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((i) => (
            <div key={i.k} className="bg-forest p-6 lg:p-8">
              <dt className="font-mono text-xs uppercase tracking-widest text-cream/50">{i.k}</dt>
              <dd className="mt-6">
                <span className="block text-xl font-semibold">{i.v}</span>
                <span className="mt-2 block text-sm leading-relaxed text-cream/70">{i.d}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export function ClosingCta() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
      <div className="grid items-end gap-10 border border-hairline bg-paper p-8 sm:p-12 lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="eyebrow text-terracotta">Got an invitation email?</p>
          <p className="mt-4 text-balance text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
            Set up your account in under a minute.
          </p>
        </div>
        <div className="flex flex-col gap-4 lg:items-end">
          <Link
            href="/sign-in?mode=activate"
            className="inline-flex h-14 items-center justify-center gap-4 bg-forest px-7 font-semibold text-cream hover:bg-forest-deep"
          >
            Activate invitation
            <ArrowUpRight className="size-4 opacity-70" aria-hidden="true" />
          </Link>
          <p className="text-sm text-muted-foreground">
            Pharmacy emergency line{' '}
            <a href="tel:9055550199" className="font-mono text-forest underline underline-offset-4">
              905-555-0199
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between lg:px-10">
        <p>{"© 2026 Henderson's Pharmacy. Authorized users only."}</p>
        <p className="flex gap-4">
          <span>Privacy</span>
          <span>Accessibility</span>
          <span>System status</span>
        </p>
      </div>
    </footer>
  )
}
