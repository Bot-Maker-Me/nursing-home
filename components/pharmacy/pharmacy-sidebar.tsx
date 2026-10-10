'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const pharmacyNav = [{ href: '/pharmacy', label: 'Conversations' }]

function NavList() {
  const pathname = usePathname()
  return (
    <ul className="space-y-1">
      {pharmacyNav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 px-3 py-2 text-sm transition-colors',
                active ? 'bg-sidebar-accent font-medium text-white' : 'text-sidebar-foreground/85 hover:bg-white/5 hover:text-white',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('size-2 shrink-0', active ? 'bg-[#f0d36b]' : 'border border-current opacity-60')}
              />
              <span className="flex-1">{item.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function PharmacyLabel({ pharmacyName }: { pharmacyName: string }) {
  return (
    <p className="border border-sidebar-border bg-white/5 px-3 py-3 text-sm font-medium text-white">{pharmacyName}</p>
  )
}

function UserChip({ name }: { name: string }) {
  const supabase = createClient()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border pt-4">
      <span className="grid size-10 place-items-center bg-[#f0d36b] font-mono text-sm font-semibold text-forest">
        {initials || 'P'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        <p className="text-xs text-sidebar-foreground/60">Pharmacy team</p>
      </div>
      <button
        type="button"
        onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/sign-in' })}
        className="grid size-10 place-items-center text-sidebar-foreground/70 hover:text-white"
        aria-label="Sign out"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

export function PharmacySidebar({ name, pharmacyName }: { name: string; pharmacyName: string }) {
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 bg-sidebar px-4 py-6 lg:flex">
        <Link href="/pharmacy" className="px-1">
          <Logo tone="light" />
        </Link>
        <div>
          <p className="eyebrow text-sidebar-foreground/60">Pharmacy</p>
          <div className="mt-2">
            <PharmacyLabel pharmacyName={pharmacyName} />
          </div>
        </div>
        <nav aria-label="Pharmacy console" className="flex-1 overflow-y-auto">
          <NavList />
        </nav>
        <UserChip name={name} />
      </aside>

      <details className="group sticky top-0 z-20 bg-sidebar lg:hidden">
        <summary className="flex h-16 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
          <Logo tone="light" />
          <span className="text-sm text-cream/80 group-open:hidden">Menu</span>
          <span className="hidden text-sm text-cream/80 group-open:inline">Close</span>
        </summary>
        <div className="space-y-6 border-t border-sidebar-border px-4 py-6">
          <div>
            <p className="eyebrow text-sidebar-foreground/60">Pharmacy</p>
            <div className="mt-2">
              <PharmacyLabel pharmacyName={pharmacyName} />
            </div>
          </div>
          <nav aria-label="Pharmacy console mobile">
            <NavList />
          </nav>
          <UserChip name={name} />
        </div>
      </details>
    </>
  )
}
