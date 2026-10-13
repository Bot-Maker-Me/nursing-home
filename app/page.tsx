import { SiteHeader } from '@/components/landing/site-header'
import { Hero } from '@/components/landing/hero'
import { DayTimeline } from '@/components/landing/day-timeline'
import { Rooms } from '@/components/landing/rooms'
import { ClosingCta, Safeguards, SiteFooter } from '@/components/landing/safeguards'

export default function Page() {
  return (
    // The marketing theme scope. It only ever applies to this route: the portal,
    // admin/pharmacy consoles and per-home themes resolve their own tokens.
    <div data-site-theme="pharma" className="min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <DayTimeline />
        <Rooms />
        <Safeguards />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  )
}
