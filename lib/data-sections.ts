export type SectionKey = 'policies' | 'deliveries' | 'cutoffs' | 'contacts'

export type SectionDef = {
  key: SectionKey
  label: string
  description: string
  titleField: string
  columns: string[]
}

export const SECTIONS: SectionDef[] = [
  {
    key: 'policies',
    label: 'Policies & Procedures',
    description: 'Versioned documents and acknowledgement metadata.',
    titleField: 'title',
    columns: ['code', 'title', 'section', 'version', 'effective', 'pages'],
  },
  {
    key: 'deliveries',
    label: 'Delivery schedules',
    description: 'Recurring routes and delivery windows.',
    titleField: 'delivery_id',
    columns: ['delivery_id', 'window', 'driver', 'route', 'items', 'status'],
  },
  {
    key: 'cutoffs',
    label: 'Order cut-off times',
    description: 'Weekly cut-off and delivery targets.',
    titleField: 'day',
    columns: ['day', 'cutoff', 'delivery'],
  },
  {
    key: 'contacts',
    label: 'Emergency contacts',
    description: 'On-call and escalation contacts.',
    titleField: 'label',
    columns: ['label', 'role', 'phone', 'email', 'notes'],
  },
]

export const SECTION_MAP = Object.fromEntries(SECTIONS.map((section) => [section.key, section])) as Record<SectionKey, SectionDef>

export function sectionTitle(def: SectionDef, row: Record<string, unknown>): string {
  const value = row[def.titleField]
  if (typeof value === 'string' && value.trim()) return value.trim()
  const first = def.columns.map((column) => row[column]).find((candidate) => typeof candidate === 'string' && candidate.trim())
  return typeof first === 'string' ? first.trim() : def.label
}
