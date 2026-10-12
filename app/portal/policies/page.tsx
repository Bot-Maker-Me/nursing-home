import { PageHeader } from '@/components/portal/page-header'
import { PoliciesTable } from '@/components/portal/policies-table'
import { getTenantName } from '@/lib/auth'

export default async function PoliciesPage() {
  const homeName = await getTenantName()

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-card bg-forest px-4 py-3 text-sm text-cream">
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
