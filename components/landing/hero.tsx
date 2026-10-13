import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Ledger } from './ledger'
import { Reveal, RevealText } from './reveal'

/**
 * Hero: min-height 100svh, two columns on desktop (7/5), stacked under lg.
 * Top padding equals the nav height so nothing sits under the header.
 * Copy animates in on load (word-by-word reveal, then staggered fades).
 */
export function Hero() {
  return (
    <section className="mx-auto flex min-h-svh max-w-7xl flex-col justify-center overflow-x-clip px-6 pt-20 pb-24 lg:px-10">
      <div className="grid items-center gap-24 lg:grid-cols-[7fr_5fr] lg:gap-16">
        <div>
          <Reveal
            as="p"
            delay={0}
            className="flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase"
          >
            <span className="reveal-rule h-px w-10 bg-highlight" aria-hidden="true" />
            § 01 — The portal
          </Reveal>

          <h1 className="mt-8 font-display text-[clamp(2.75rem,6.5vw,6.5rem)] leading-[0.95] font-semibold tracking-[-0.03em] text-balance text-foreground">
            <RevealText as="span" text="Every order," className="block" delay={140} stagger={80} />
            <RevealText as="span" text="before five." className="block text-highlight" delay={380} stagger={80} />
          </h1>

          <Reveal as="p" delay={720} className="mt-9 max-w-[52ch] text-lg leading-relaxed text-pretty text-muted-foreground">
            One secure place for your nursing team to reach the pharmacy, follow tonight&rsquo;s deliveries, and find
            the right procedure &mdash; without a single phone tree.
          </Reveal>

          <Reveal delay={860} className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link
              href="/sign-in?mode=activate"
              className="inline-flex h-12 items-center gap-3 rounded-[2px] bg-brand px-6 text-sm font-semibold tracking-[0.08em] text-[var(--on-brand)] uppercase hover:bg-brand-dark"
            >
              Activate your invitation
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 text-sm font-medium text-highlight hover:underline"
            >
              Already have access? Sign in
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Reveal>

          <Reveal as="p" delay={1000} className="mt-8 text-sm text-muted-foreground">
            Accounts are issued by your Home Administrator or Henderson&rsquo;s Pharmacy. Data stays in Canada.
          </Reveal>
        </div>

        <Reveal delay={420}>
          <Ledger />
        </Reveal>
      </div>
    </section>
  )
}
