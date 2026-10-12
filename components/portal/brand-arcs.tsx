import { cn } from '@/lib/utils'

/**
 * Pale concentric-arc motif used as a subtle header decoration for themed tenants.
 * Rendered in `--brand-tint`, and hidden entirely unless a tenant theme is active
 * (see `.brand-arcs` in globals.css), so the default look is untouched.
 */
export function BrandArcs({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('brand-arcs pointer-events-none', className)}
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
      fill="none"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx="600" cy="188" r={110 + i * 44} stroke="var(--brand-tint)" strokeWidth="2" />
      ))}
    </svg>
  )
}
