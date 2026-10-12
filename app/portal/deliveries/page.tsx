import { ArrowUpRight } from 'lucide-react'
import { Card, PageHeader, StatusPill } from '@/components/portal/page-header'
import { getTenantName } from '@/lib/auth'
import { deliveries } from '@/lib/sample-data'

export default async function DeliveriesPage() {
  const homeName = await getTenantName()

  return (
    <>
      <PageHeader
        crumb={`${homeName} / Delivery Tracking`}
        title="Delivery Tracking"
        description="Routes for today and tomorrow. Live driver positions open in the Teams driver app."
        aside={
          <a
            href="#"
            className="btn-brand inline-flex h-12 items-center gap-3 self-start px-5 text-sm font-semibold sm:self-auto"
          >
            Track deliveries in Teams
            <ArrowUpRight className="size-4 opacity-70" aria-hidden="true" />
          </a>
        }
      />
      <Card className="mt-8" eyebrow="Routes" title="Scheduled deliveries" meta={`${deliveries.length} routes`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-y border-hairline text-left">
                {['Delivery ID', 'Window', 'Driver', 'Items', 'Status'].map((h) => (
                  <th key={h} scope="col" className="eyebrow py-3 pr-4 font-semibold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-cream/60">
                  <td className="py-4 pr-4 font-mono text-xs">{d.id}</td>
                  <td className="py-4 pr-4 font-mono">{d.window}</td>
                  <td className="py-4 pr-4">{d.driver}</td>
                  <td className="py-4 pr-4 font-mono">{d.items}</td>
                  <td className="py-4">
                    <StatusPill status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
