'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  PhoneCall,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { NotificationBell } from '@/components/portal/notification-bell'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type NavItem = { href: string; label: string; icon: LucideIcon }

export const portalNav: NavItem[] = [
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/messages', label: 'Connect with Pharmacy', icon: MessagesSquare },
  { href: '/portal/deliveries', label: 'Delivery Tracking', icon: Truck },
  { href: '/portal/cutoffs', label: 'Operating hours & Order Cut-offs', icon: CalendarClock },
  { href: '/portal/policies', label: 'Policies & Procedures', icon: FileText },
  { href: '/portal/education', label: 'Education & Training', icon: GraduationCap },
  { href: '/portal/contacts', label: 'Emergency & Contacts', icon: PhoneCall },
  { href: '/portal/account', label: 'Account', icon: UserRound },
]

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <ul className="space-y-1">
      {portalNav.map((item) => {
        const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className="nav-link flex min-h-11 items-center gap-3 px-3 py-2 text-sm transition-colors"
            >
              {/* Default tenants keep the square bullet; themed tenants show a line icon. */}
              <span aria-hidden="true" className={cn('nav-bullet size-2 shrink-0', active ? 'bg-marker' : 'border border-current opacity-60')} />
              <Icon aria-hidden="true" className="nav-icon size-[18px] shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && (
                <span aria-hidden="true" className="nav-accent size-1.5 rounded-full bg-[var(--sidebar-marker)]" />
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function TenantCard({ homeName }: { homeName: string }) {
  return <p className="tenant-card px-3 py-3 text-sm font-medium text-sidebar-strong">{homeName}</p>
}

function UserChip({ profile }: { profile: { name: string; role: string } }) {
  const supabase = createClient()
  const initials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border pt-4">
      <span className="avatar-mark grid size-10 shrink-0 place-items-center rounded-avatar bg-marker font-mono text-sm font-semibold text-brand">
        {initials || 'P'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-strong">{profile.name}</p>
        <p className="truncate text-xs text-sidebar-foreground/70">{profile.role}</p>
      </div>
      <button
        type="button"
        onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/sign-in' })}
        className="grid size-10 shrink-0 place-items-center text-sidebar-foreground/70 hover:text-sidebar-strong"
        aria-label="Sign out"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function HomeSection({ homeName, className }: { homeName: string; className?: string }) {
  return (
    <div className={className}>
      <p className="eyebrow text-sidebar-foreground/60">Home</p>
      <div className="mt-2">
        <TenantCard homeName={homeName} />
      </div>
    </div>
  )
}

export function PortalSidebar({ profile }: { profile: { name: string; role: string; homeName: string } }) {
  const mobileMenu = useRef<HTMLDetailsElement>(null)
  const closeMenu = () => mobileMenu.current?.removeAttribute('open')

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 bg-sidebar px-4 py-6 lg:flex">
        <div className="flex items-center justify-between gap-2">
          <Link href="/portal" className="px-1">
            <Logo tone="light" />
          </Link>
          <NotificationBell />
        </div>
        <HomeSection homeName={profile.homeName} />
        <nav aria-label="Portal" className="flex-1 overflow-y-auto">
          <NavList />
        </nav>
        <UserChip profile={profile} />
      </aside>

      <details ref={mobileMenu} className="portal-mobile-bar group sticky top-0 z-20 bg-sidebar lg:hidden">
        <summary className="flex h-16 cursor-pointer list-none items-center justify-between gap-2 px-4 [&::-webkit-details-marker]:hidden">
          <Logo tone="light" />
          <span className="flex items-center gap-1">
            <NotificationBell />
            <span className="text-sm text-sidebar-foreground/80 group-open:hidden">Menu</span>
            <span className="hidden text-sm text-sidebar-foreground/80 group-open:inline">Close</span>
          </span>
        </summary>
        <div className="max-h-[calc(100dvh-4rem)] space-y-6 overflow-y-auto border-t border-sidebar-border px-4 py-6">
          <HomeSection homeName={profile.homeName} />
          <nav aria-label="Portal mobile">
            <NavList onNavigate={closeMenu} />
          </nav>
          <UserChip profile={profile} />
        </div>
      </details>
    </>
  )
}
