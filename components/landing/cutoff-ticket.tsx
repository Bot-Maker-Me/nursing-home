'use client'

import { useCutoff } from '@/hooks/use-cutoff'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function CutoffTicket() {
  const c = useCutoff('17:00')

  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0">
      <div className="paper-shadow relative border border-hairline bg-paper">
        <div className="flex items-center justify-between border-b border-dashed border-hairline px-6 py-3">
          <span className="eyebrow text-terracotta">Order cut-off</span>
          <span className="font-mono text-xs text-muted-foreground">HM-0142 · Maple Ridge</span>
        </div>

        <div className="px-6 pt-6 pb-4">
          <p className="text-sm text-muted-foreground">Today, last orders at</p>
          <p className="mt-1 text-6xl font-bold tracking-tighter text-forest sm:text-7xl">5:00 PM</p>

          <div className="mt-6 grid grid-cols-3 border border-hairline" role="timer" aria-live="off" aria-label={c.label}>
            {[
              { v: c.hours, l: 'hrs' },
              { v: c.minutes, l: 'min' },
              { v: c.seconds, l: 'sec' },
            ].map((u, i) => (
              <div key={u.l} className={i > 0 ? 'border-l border-hairline px-3 py-3' : 'px-3 py-3'}>
                <span className="block font-mono text-2xl font-medium tabular-nums text-foreground">
                  {c.ready ? pad(u.v) : '--'}
                </span>
                <span className="eyebrow text-muted-foreground">{u.l}</span>
              </div>
            ))}
          </div>
          {c.ready && c.passed && (
            <p className="mt-3 text-sm text-terracotta">{"Today's cut-off has passed. Next window opens tomorrow."}</p>
          )}
        </div>

        <div className="relative flex items-center">
          <span className="absolute -left-3 size-6 rounded-full border border-hairline bg-cream" aria-hidden="true" />
          <span className="mx-6 h-px flex-1 border-t border-dashed border-hairline" aria-hidden="true" />
          <span className="absolute -right-3 size-6 rounded-full border border-hairline bg-cream" aria-hidden="true" />
        </div>

        <dl className="grid grid-cols-2 gap-4 px-6 py-5 text-sm">
          <div>
            <dt className="eyebrow text-muted-foreground">Delivery by</dt>
            <dd className="mt-1 font-medium">9:00 PM</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">On route</dt>
            <dd className="mt-1 flex items-center gap-2 font-medium">
              <span className="size-2 rounded-full bg-forest-soft" aria-hidden="true" />2 deliveries
            </dd>
          </div>
        </dl>
      </div>

      <div className="absolute -bottom-10 -left-6 hidden w-64 -rotate-3 border border-hairline bg-mint p-4 shadow-sm sm:block lg:-left-16">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-forest">Pharmacy · 14:12</span>
          <span className="bg-terracotta px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Urgent
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-forest">
          Replacement strip pack is on the 19:30 route for Res. #4471.
        </p>
      </div>
    </div>
  )
}
