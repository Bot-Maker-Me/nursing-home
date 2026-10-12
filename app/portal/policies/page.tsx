import { PageHeader } from '@/components/portal/page-header'
import { PoliciesTable } from '@/components/portal/policies-table'
import { getPortalProfile } from '@/lib/auth'

export default async function PoliciesPage() {
  const profile = await getPortalProfile()
  const homeName = profile?.home_name || 'Your home'

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3 bg-forest px-4 py-3 text-sm text-cream">
        <span className="eyebrow text-marker">Updated</span>
        OR-03 Order cut-offs, STAT and after-hours requests — v5.0 effective 2026-10-01.
      </div>
      <PageHeader
        crumb={`${homeName} / Policies & Procedures`}
        title="Policies & Procedures"
        description="Versioned manual with effective dates. Opening a document is recorded for acknowledgement tracking."
      />
      <PoliciesTable />
    </>
  )
}
