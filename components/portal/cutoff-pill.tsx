'use client'

import { useCutoff } from '@/hooks/use-cutoff'
import { cn } from '@/lib/utils'

export function CutoffPill({ cutoff = '17:00' }: { cutoff?: string }) {
  const c = useCutoff(cutoff)
  const soon = c.ready && !c.passed && c.hours === 0
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 self-start px-3 py-2 text-sm font-medium sm:self-auto',
        c.passed ? 'bg-secondary text-muted-foreground' : soon ? 'bg-[#f6e3d6] text-[#8f3c25]' : 'bg-mint text-forest',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 rounded-full', c.passed ? 'bg-muted-foreground' : soon ? 'bg-terracotta animate-pulse' : 'bg-forest-soft')}
      />
      Today · <span className="font-mono tabular-nums">{c.label}</span>
    </div>
  )
}
