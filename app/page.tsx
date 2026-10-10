import { SiteHeader } from '@/components/landing/site-header'
import { Hero } from '@/components/landing/hero'
import { DayTimeline } from '@/components/landing/day-timeline'
import { Rooms } from '@/components/landing/rooms'
import { ClosingCta, Safeguards, SiteFooter } from '@/components/landing/safeguards'

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <DayTimeline />
        <Rooms />
        <Safeguards />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  )
}
