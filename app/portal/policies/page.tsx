import { PageHeader } from '@/components/portal/page-header'
import { PoliciesTable } from '@/components/portal/policies-table'
import { currentHome } from '@/lib/sample-data'

export default function PoliciesPage() {
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3 bg-forest px-4 py-3 text-sm text-cream">
        <span className="eyebrow text-[#f0d36b]">Updated</span>
        OR-03 Order cut-offs, STAT and after-hours requests — v5.0 effective 2026-10-01.
      </div>
      <PageHeader
        crumb={`${currentHome.name} / Policies & Procedures`}
        title="Policies & Procedures"
        description="Versioned manual with effective dates. Opening a document is recorded for acknowledgement tracking."
      />
      <PoliciesTable />
    </>
  )
}
