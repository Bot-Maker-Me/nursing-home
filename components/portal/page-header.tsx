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
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{crumb}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] sm:text-4xl lg:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{description}</p>
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
  Delivered: 'status-delivered',
  'Out for delivery': 'status-out',
  Preparing: 'status-preparing',
  Scheduled: 'status-scheduled',
  Active: 'status-delivered',
  Invited: 'status-preparing',
  Deactivated: 'status-scheduled line-through',
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill inline-flex items-center px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? 'chip-neutral'}`}>
      {status}
    </span>
  )
}
