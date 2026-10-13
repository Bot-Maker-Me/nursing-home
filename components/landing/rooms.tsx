import { Reveal, RevealText } from './reveal'

const rooms = [
  {
    n: '01',
    title: 'Connect with Pharmacy',
    body: 'Secure channels per home, threads per resident by ID only. Flag what is urgent, see when it was read.',
    meta: 'Chat · Read receipts',
  },
  {
    n: '02',
    title: 'Delivery Tracking',
    body: 'See which route is on the road and when it lands, straight from the driver system.',
    meta: 'Live routes',
  },
  {
    n: '03',
    title: 'Order Cut-offs',
    body: 'A countdown your whole floor can read across the room, with holidays and weekends handled for you.',
    meta: 'Per-home schedule',
  },
  {
    n: '04',
    title: 'Policies & Procedures',
    body: 'All 350 pages, searchable, versioned, with effective dates and a record of who has read what.',
    meta: 'Versioned · Acknowledged',
  },
  {
    n: '05',
    title: 'Emergency & Contacts',
    body: 'Your assigned pharmacist and the after-hours protocol, one tap away on any tablet.',
    meta: 'Tap-to-call',
  },
]

export function Rooms() {
  return (
    <section id="rooms" aria-labelledby="rooms-heading" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
      <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <Reveal as="p" className="eyebrow text-terracotta">
            {"What's inside"}
          </Reveal>
          <RevealText
            as="h2"
            id="rooms-heading"
            text="Five rooms. One front door."
            className="mt-4 text-balance text-4xl font-bold tracking-[-0.04em] sm:text-5xl"
            delay={100}
          />
          <Reveal as="p" delay={280} className="mt-4 max-w-sm leading-relaxed text-muted-foreground">
            Built for shared nursing-station desktops and tablets on the floor — large targets, calm screens.
          </Reveal>
        </div>
        <ol className="border-t border-hairline">
          {rooms.map((r, index) => (
            <Reveal
              as="li"
              key={r.n}
              delay={index * 90}
              className="grid grid-cols-[3rem_1fr] gap-4 border-b border-hairline py-8 sm:grid-cols-[4rem_1fr_auto] sm:gap-8"
            >
              <span className="font-mono text-sm text-terracotta">{r.n}</span>
              <div>
                <h3 className="text-xl font-semibold tracking-tight">{r.title}</h3>
                <p className="mt-2 max-w-md leading-relaxed text-muted-foreground">{r.body}</p>
              </div>
              <span className="col-start-2 self-start bg-mint px-2.5 py-1 text-xs font-medium text-forest sm:col-start-auto">
                {r.meta}
              </span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
