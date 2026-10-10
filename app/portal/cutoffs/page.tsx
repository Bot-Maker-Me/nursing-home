import { Card, PageHeader } from '@/components/portal/page-header'
import { currentHome, holidays, weeklySchedule } from '@/lib/sample-data'

export default function CutoffsPage() {
  return (
    <>
      <PageHeader
        crumb={`${currentHome.name} / Order Cut-offs`}
        title="Order Cut-offs"
        description="All times Eastern. Orders after cut-off go out on the next route unless marked STAT by phone."
      />
      <div className="mt-8 border-l-4 border-terracotta bg-paper p-6">
        <p className="eyebrow text-terracotta">Standing rule</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          Last orders <span className="font-mono">5:00 PM</span> · delivered before <span className="font-mono">9:00 PM</span>
        </p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Weekly" title="Regular schedule">
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Day</th>
                <th>Cut-off</th>
                <th>Delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline border-y border-hairline">
              {weeklySchedule.map((d) => (
                <tr key={d.day}>
                  <td className="py-3 font-medium">{d.day}</td>
                  <td className="py-3 font-mono text-forest">{d.cutoff}</td>
                  <td className="py-3 text-right text-muted-foreground">{d.delivery}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card eyebrow="Exceptions" title="Upcoming holidays" meta={`${holidays.length} dates`}>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {holidays.map((h) => (
              <li key={h.date} className="grid grid-cols-[7rem_1fr] gap-4 py-3 text-sm">
                <span className="font-mono text-muted-foreground">{h.date}</span>
                <span>
                  <span className="font-medium">{h.name}</span>
                  <span className="block text-xs text-muted-foreground">{h.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
