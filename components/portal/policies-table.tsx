'use client'

import { useMemo, useState } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'
import { policies } from '@/lib/sample-data'

export function PoliciesTable() {
  const [query, setQuery] = useState('')
  const [asc, setAsc] = useState(true)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return policies
      .filter((p) => !q || `${p.code} ${p.title} ${p.section}`.toLowerCase().includes(q))
      .sort((a, b) => (asc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)))
  }, [query, asc])

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="policy-search" className="sr-only">
            Search policies
          </label>
          <input
            id="policy-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, section, or code…"
            className="h-11 w-full border border-hairline bg-paper pr-3 pl-9 text-sm focus:border-forest focus:outline-none"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {policies.length} documents
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="h-11 border border-hairline bg-paper px-4 text-sm">
            Filter
          </button>
          <button type="button" className="h-11 border border-hairline bg-paper px-4 text-sm">
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto border border-hairline bg-paper">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th scope="col" className="eyebrow px-4 py-3 text-muted-foreground">Code</th>
              <th scope="col" className="eyebrow px-4 py-3 text-muted-foreground" aria-sort={asc ? 'ascending' : 'descending'}>
                <button type="button" onClick={() => setAsc(!asc)} className="eyebrow inline-flex items-center gap-1.5">
                  Title <ArrowUpDown className="size-3 text-terracotta" aria-hidden="true" />
                </button>
              </th>
              <th scope="col" className="eyebrow px-4 py-3 text-muted-foreground">Version</th>
              <th scope="col" className="eyebrow px-4 py-3 text-muted-foreground">Effective</th>
              <th scope="col" className="eyebrow px-4 py-3 text-muted-foreground">Pages</th>
              <th scope="col" className="eyebrow px-4 py-3 text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((p) => (
              <tr key={p.code} className="hover:bg-cream/60">
                <td className="px-4 py-4 font-mono text-xs text-forest-soft">{p.code}</td>
                <td className="px-4 py-4">
                  <span className="font-medium">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">{p.section}</span>
                </td>
                <td className="px-4 py-4 font-mono text-xs">{p.version}</td>
                <td className="px-4 py-4 font-mono text-xs">{p.effective}</td>
                <td className="px-4 py-4 font-mono text-xs">{p.pages}</td>
                <td className="px-4 py-4">
                  {p.acknowledged ? (
                    <span className="bg-mint px-2 py-0.5 text-xs font-medium text-forest">Acknowledged</span>
                  ) : (
                    <span className="text-xs font-medium text-terracotta">Needs acknowledgement</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No documents match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
