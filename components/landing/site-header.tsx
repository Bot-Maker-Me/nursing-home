import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Logo } from '@/components/brand/logo'

export function SiteHeader() {
  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-10">
        <Link href="/" aria-label="Henderson's Pharmacy portal home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-6">
          <a href="#rooms" className="hidden text-sm text-foreground/75 hover:text-forest md:inline">
            {"What's inside"}
          </a>
          <a href="#safeguards" className="hidden text-sm text-foreground/75 hover:text-forest md:inline">
            Safeguards
          </a>
          <Link href="/sign-in" className="px-3 py-2 text-sm text-foreground/75 hover:text-forest">
            Sign in
          </Link>
          <Link
            href="/sign-in?mode=activate"
            className="inline-flex h-11 items-center gap-3 bg-forest px-5 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            Activate invite
            <ArrowUpRight className="size-4 opacity-70" aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  )
}
