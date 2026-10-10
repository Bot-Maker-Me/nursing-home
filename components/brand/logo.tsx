import { cn } from '@/lib/utils'

export function Logo({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'relative grid size-7 place-items-center',
          tone === 'dark' ? 'bg-forest text-cream' : 'bg-terracotta text-white',
        )}
      >
        <span className="absolute h-3.5 w-[3px] bg-current" />
        <span className="absolute h-[3px] w-3.5 bg-current" />
      </span>
      <span
        className={cn(
          'text-lg font-bold tracking-tight',
          tone === 'dark' ? 'text-forest' : 'text-white',
        )}
      >
        {"Henderson's"}
        <span className={cn('font-normal', tone === 'dark' ? 'text-muted-foreground' : 'text-white/60')}>
          {' '}
          portal
        </span>
      </span>
    </span>
  )
}
