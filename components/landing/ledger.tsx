/**
 * The hero's right column: a cream "register" sheet with a rubber stamp and floating
 * chips. Pure CSS — no images, no animation — so it costs nothing to render and can't
 * shift the layout.
 *
 * On >=lg the chips are absolutely positioned around the sheet; below lg they fall back
 * into normal flow beneath it, so nothing can overlap or clip on small screens. The
 * table itself scrolls inside the sheet on narrow screens rather than overflowing.
 */

const rows = [
  { date: '07 Oct 26', route: 'Route A · Wing B', items: 14, out: 12, bal: 2 },
  { date: '07 Oct 26', route: 'Route C · Wing D', items: 6, out: 6, bal: 0 },
  { date: '06 Oct 26', route: 'Route B · Wing A', items: 9, out: 9, bal: 0 },
  { date: '06 Oct 26', route: 'STAT · on-call', items: 2, out: 2, bal: 0 },
  { date: '05 Oct 26', route: 'Route A · Wing B', items: 22, out: 20, bal: 2 },
]

export function Ledger() {
  return (
    <div className="relative mx-auto w-full max-w-[clamp(320px,60vw,600px)] lg:mx-0 lg:pb-36">
      {/* sheet stack */}
      <div className="relative">
        {/* second sheet behind, slightly darker */}
        <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rotate-1 bg-[var(--sheet-back)]" />

        {/* front sheet — extra bottom/right padding keeps the stamp clear of the numbers */}
        <div className="relative -rotate-[1.5deg] bg-[var(--sheet)] pt-8 pr-14 pb-14 pl-6 lg:pr-[72px] lg:pb-[72px] lg:pl-8">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[19rem] table-fixed border-collapse font-mono text-sm tabular-nums text-[var(--ink)]">
              <thead>
                <tr className="text-left text-[11px] tracking-[0.12em] text-[var(--ink-muted)] uppercase">
                  <th scope="col" className="w-[100px] pb-3 font-medium whitespace-nowrap lg:w-[110px]">
                    Date
                  </th>
                  <th scope="col" className="pb-3 pl-6 font-medium">
                    Route
                  </th>
                  <th scope="col" className="w-12 pb-3 text-right font-medium lg:w-14">
                    Items
                  </th>
                  <th scope="col" className="w-12 pb-3 text-right font-medium lg:w-14">
                    Out
                  </th>
                  <th scope="col" className="w-12 pb-3 text-right font-medium lg:w-14">
                    Bal
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.date}-${row.route}`} className="border-t border-[var(--sheet-line)]">
                    <td className="py-3.5 whitespace-nowrap">{row.date}</td>
                    <td className="py-3.5 pl-6">{row.route}</td>
                    <td className="py-3.5 text-right">{row.items}</td>
                    <td className="py-3.5 text-right">{row.out}</td>
                    <td className="py-3.5 text-right">{row.bal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* stamp sits in the padding, never over a number */}
          <div
            aria-hidden="true"
            className="absolute -right-3 -bottom-3 grid size-16 -rotate-12 place-items-center rounded-full border-[3px] border-double border-brand text-[10px] font-bold tracking-[0.08em] text-brand uppercase lg:-right-8 lg:-bottom-8 lg:size-24 lg:text-[13px]"
          >
            Signed
          </div>
        </div>
      </div>

      {/* chips — in flow below lg, floating around the sheet at lg+ */}
      <div className="mt-6 w-fit rounded-xl border border-hairline bg-paper px-4 py-2.5 lg:absolute lg:-top-6 lg:right-6 lg:mt-0">
        <span className="block text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          On tonight&rsquo;s routes
        </span>
        <span className="font-mono text-lg text-foreground">14</span>
      </div>

      <div className="mt-3 w-fit rounded-xl border border-hairline bg-paper px-4 py-2.5 font-mono text-sm leading-6 text-muted-foreground lg:absolute lg:bottom-20 lg:left-0 lg:mt-0">
        HM-0142 · 16:52
        <br />
        RD · 17:02
      </div>

      <div className="mt-3 rounded-xl border border-hairline border-l-[3px] border-l-brand bg-paper px-4 py-3 text-sm text-foreground lg:absolute lg:bottom-2 lg:left-0 lg:mt-0 lg:max-w-xs">
        Late order: Res #4471, placed after the 17:00 cut-off.
      </div>
    </div>
  )
}
