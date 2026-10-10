import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { CutoffTicket } from './cutoff-ticket'

export function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-16 pb-24 lg:px-10 lg:pt-24">
      <div className="grid items-center gap-20 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="flex items-center gap-3 text-terracotta">
            <span className="h-px w-10 bg-terracotta" aria-hidden="true" />
            <span className="eyebrow">For long-term care homes served by Henderson&apos;s</span>
          </p>
          <h1 className="mt-6 text-balance text-6xl font-bold leading-[0.92] tracking-[-0.05em] text-foreground sm:text-7xl lg:text-8xl">
            Every order,
            <br />
            <span className="text-forest">before five.</span>
          </h1>
          <p className="mt-8 max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
            One secure place for your nursing team to reach the pharmacy, follow tonight&apos;s deliveries, and find
            the right procedure — without a single phone tree.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/sign-in?mode=activate"
              className="inline-flex h-14 items-center gap-4 bg-forest px-7 font-semibold text-cream transition-colors hover:bg-forest-deep"
            >
              Activate your invitation
              <ArrowUpRight className="size-4 opacity-70" aria-hidden="true" />
            </Link>
            <Link href="/sign-in" className="text-sm font-medium text-forest underline underline-offset-4">
              Already have access? Sign in
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Accounts are issued by your Home Administrator or Henderson&apos;s Pharmacy. Data stays in Canada.
          </p>
        </div>
        <CutoffTicket />
      </div>
    </section>
  )
}
