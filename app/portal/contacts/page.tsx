import { Phone } from 'lucide-react'
import { Card, PageHeader } from '@/components/portal/page-header'
import { getTenantName } from '@/lib/auth'
import { currentHome } from '@/lib/sample-data'

function CallButton({ number, label }: { number: string; label: string }) {
  return (
    <a
      href={`tel:${number.replace(/\D/g, '')}`}
      className="flex min-h-16 items-center justify-between gap-4 border border-forest bg-forest px-5 text-cream hover:bg-forest-deep"
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-2 font-mono text-lg">
        <Phone className="size-4" aria-hidden="true" />
        {number}
      </span>
    </a>
  )
}

export default async function ContactsPage() {
  const homeName = await getTenantName()

  return (
    <>
      <PageHeader
        crumb={`${homeName} / Emergency & Contacts`}
        title="Emergency & Contacts"
        description="Tap a number to call from a tablet or phone."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Assigned pharmacist" title={currentHome.pharmacist}>
          <p className="text-sm text-muted-foreground">Weekdays 08:00 – 18:00 · Saturday 09:00 – 13:00</p>
          <div className="mt-6">
            <CallButton number={currentHome.pharmacistPhone} label="Direct line" />
          </div>
        </Card>
        <section className="border border-terracotta bg-[var(--danger-bg)] p-6 sm:p-7">
          <p className="eyebrow text-terracotta">After hours & emergency</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">On-call pharmacist, 24/7</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>Call the on-call line and state your home and resident reference.</li>
            <li>Use resident ID only. Have the MAR open.</li>
            <li>Use the emergency box for first doses while delivery is arranged.</li>
          </ol>
          <div className="mt-6">
            <CallButton number={currentHome.afterHours} label="On-call line" />
          </div>
        </section>
      </div>
    </>
  )
}
