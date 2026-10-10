const marks = [
  { time: '08:30', label: 'Morning route arrives', accent: false },
  { time: '13:00', label: 'Midday top-ups', accent: false },
  { time: '17:00', label: 'Order cut-off', accent: true },
  { time: '19:30', label: 'Evening route leaves', accent: false },
  { time: '21:00', label: 'Delivered to the home', accent: false },
]

export function DayTimeline() {
  return (
    <section aria-labelledby="day-heading" className="border-y border-hairline bg-paper">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="day-heading" className="text-2xl font-semibold tracking-tight">
            A pharmacy day, on one line.
          </h2>
          <p className="text-sm text-muted-foreground">Times configurable per home · Eastern Time</p>
        </div>
        <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-5 sm:gap-0">
          {marks.map((m) => (
            <li key={m.time} className="relative sm:pr-4">
              <div className="hidden items-center sm:flex" aria-hidden="true">
                <span className={m.accent ? 'size-3 bg-terracotta' : 'size-3 border border-forest bg-paper'} />
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <p
                className={
                  m.accent
                    ? 'font-mono text-2xl font-medium text-terracotta sm:mt-4'
                    : 'font-mono text-2xl font-medium text-forest sm:mt-4'
                }
              >
                {m.time}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{m.label}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
