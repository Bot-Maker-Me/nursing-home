'use client'

import { useCutoff } from '@/hooks/use-cutoff'
import { cn } from '@/lib/utils'

export function CutoffPill({ cutoff = '17:00' }: { cutoff?: string }) {
  const c = useCutoff(cutoff)
  const soon = c.ready && !c.passed && c.hours === 0
  return (
    <div
      className={cn(
        'chip inline-flex items-center gap-2.5 self-start px-3 py-2 text-sm font-medium sm:self-auto',
        c.passed ? 'chip-neutral' : soon ? 'chip-warn' : 'chip-brand',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 rounded-full', c.passed ? 'bg-muted-foreground' : soon ? 'bg-terracotta animate-pulse' : 'bg-forest-soft')}
      />
      Today · <span className="cutoff-chip-label">{c.label}</span>
    </div>
  )
}
