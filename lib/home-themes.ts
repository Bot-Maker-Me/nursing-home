import type { CSSProperties } from 'react'

/**
 * Per-tenant ("fully custom") theming.
 *
 * A theme is simply a map of the app's semantic design tokens to values. It is applied
 * on the portal shell for ONE home only (via `data-home-theme` + inline CSS variables),
 * so it re-skins that home's portal and nothing else — other homes, the pharmacy/admin
 * consoles and the public site keep the default palette.
 *
 * To add a theme for another nursing home, copy the `TONY_STACEY` entry, change the
 * `slug`/`name`/tokens, and store `{ "slug": "your-slug" }` on that home's `homes` row
 * (or let it match by name). Nothing else needs to change.
 */
export type HomeTheme = {
  slug: string
  name: string
  /** Semantic design tokens → CSS custom properties (see app/globals.css). */
  tokens: Record<string, string>
}

const TONY_STACEY: HomeTheme = {
  slug: 'tony-stacey',
  name: "Tony Stacey Centre for Veterans' Care",
  tokens: {
    // Brand — deeper, calmer crimson (#c8102e read too bright, especially on large areas)
    '--brand': '#a8122f',
    '--brand-dark': '#8b0f27',
    '--brand-deep': '#6b0b1d',
    '--brand-tint': '#fdecef',
    '--on-brand': '#ffffff',
    '--highlight': '#a8122f',
    '--marker': '#f2c94c',

    // Surfaces & text
    '--bg': '#f6f6f7',
    '--surface': '#ffffff',
    '--line': '#e7e7ea',
    '--text': '#1a1a1a',
    '--text-muted': '#5f6368',
    '--tint': '#f5f5f7',

    // Status (AA contrast on their own backgrounds)
    '--status-delivered-bg': '#e8f5ec',
    '--status-delivered-ink': '#1e6b3a',
    '--status-out-bg': '#fdf3e2',
    '--status-out-ink': '#8a5a00',
    '--status-preparing-bg': '#fdecef',
    '--status-preparing-ink': '#8b0f27',
    '--status-scheduled-ink': '#5f6368',
    '--danger-bg': '#fdecef',
    '--danger-ink': '#8b0f27',

    // Sidebar
    '--sidebar': '#8b0f27',
    '--sidebar-foreground': '#ffe5ea',
    '--sidebar-primary': '#ffffff',
    '--sidebar-primary-foreground': '#6b0b1d',
    '--sidebar-accent': '#6b0b1d',
    '--sidebar-accent-foreground': '#ffffff',
    '--sidebar-border': 'rgb(255 255 255 / 0.18)',
    '--sidebar-ring': '#f2c94c',
    '--sidebar-hover': 'rgb(255 255 255 / 0.12)',
    '--sidebar-marker': '#f2c94c',

    // Marks on the sidebar (logo mark + notification badge)
    '--logo-mark-bg': '#f2c94c',
    '--logo-mark-ink': '#6b0b1d',
    '--badge-bg': '#f2c94c',
    '--badge-ink': '#6b0b1d',

    // Depth & shape → rounded cards, pill buttons, soft shadows
    '--shadow-color': '#e0e0e3',
    '--shadow-card': '0 1px 3px rgb(16 24 40 / 6%), 0 1px 2px rgb(16 24 40 / 4%)',
    '--radius': '0.9rem',
    '--radius-card': '16px',
    '--radius-pill': '9999px',
    '--radius-nav': '0.625rem',
    '--radius-avatar': '9999px',
    '--radius-field': '0.625rem',
    '--radius-badge': '9999px',
  },
}

/** Registry of every custom home theme. Add one entry per themed home. */
export const HOME_THEMES: HomeTheme[] = [TONY_STACEY]

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function themeBySlug(slug: string | null | undefined): HomeTheme | null {
  if (!slug) return null
  return HOME_THEMES.find((theme) => theme.slug === slug) ?? null
}

export function themeByName(name: string | null | undefined): HomeTheme | null {
  const target = normalize(name ?? '')
  if (!target) return null
  return (
    HOME_THEMES.find((theme) => {
      const key = normalize(theme.name)
      const short = key.split(' ').slice(0, 2).join(' ')
      return target === key || (short.length > 0 && target.includes(short))
    }) ?? null
  )
}

/**
 * Resolves the active theme for a home. The `theme` jsonb stored on the home wins (by
 * slug), otherwise the home's name is matched against the registry; otherwise null
 * (⇒ the default palette).
 */
export function resolveHomeTheme({
  dbTheme,
  names,
}: {
  dbTheme?: unknown
  names: Array<string | null | undefined>
}): HomeTheme | null {
  if (dbTheme && typeof dbTheme === 'object' && 'slug' in dbTheme) {
    const slug = (dbTheme as { slug?: unknown }).slug
    const match = themeBySlug(typeof slug === 'string' ? slug : null)
    if (match) return match
  }
  for (const name of names) {
    const match = themeByName(name)
    if (match) return match
  }
  return null
}

/** Converts a theme into the inline CSS custom properties applied on the portal shell. */
export function themeStyle(theme: HomeTheme): CSSProperties {
  return theme.tokens as unknown as CSSProperties
}
