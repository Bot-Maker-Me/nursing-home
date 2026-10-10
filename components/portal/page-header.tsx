import { CutoffPill } from './cutoff-pill'

export function PageHeader({
  crumb,
  title,
  description,
  aside,
}: {
  crumb: string
  title: string
  description: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-hairline pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs text-muted-foreground">{crumb}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.045em] sm:text-5xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {aside ?? <CutoffPill />}
    </header>
  )
}

export function Card({
  eyebrow,
  title,
  meta,
  children,
  className = '',
}: {
  eyebrow?: string
  title?: string
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`border border-hairline bg-paper p-6 sm:p-7 ${className}`}>
      {(eyebrow || meta) && (
        <div className="flex items-start justify-between gap-4">
          {eyebrow && <p className="eyebrow text-forest-soft/80">{eyebrow}</p>}
          {meta && <div className="text-sm font-medium text-terracotta">{meta}</div>}
        </div>
      )}
      {title && <h2 className="mt-3 text-xl font-semibold tracking-tight">{title}</h2>}
      <div className={title || eyebrow ? 'mt-5' : ''}>{children}</div>
    </section>
  )
}

const statusStyles: Record<string, string> = {
  Delivered: 'bg-mint text-forest',
  'Out for delivery': 'bg-[#f6e3d6] text-[#8f3c25]',
  Preparing: 'bg-secondary text-foreground/80',
  Scheduled: 'border border-hairline text-muted-foreground',
  Active: 'bg-mint text-forest',
  Invited: 'bg-secondary text-foreground/80',
  Deactivated: 'border border-hairline text-muted-foreground line-through',
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? 'bg-secondary'}`}>
      {status}
    </span>
  )
}
