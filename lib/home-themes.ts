import type { CSSProperties } from 'react'

/**
 * Per-home ("fully custom") theming.
 *
 * A nursing home can carry a complete theme that only applies inside its own portal —
 * other homes, the pharmacy console, the admin console and the public landing page are
 * never affected. Each theme is resolved to CSS custom properties that override the
 * design tokens in `app/globals.css` (`--forest`, `--terracotta`, `--sidebar`, …), so
 * every component re-skins with no component-level changes.
 *
 * A home is matched to a theme either by the `theme` jsonb stored on its `homes` row
 * (`{ "slug": "tony-stacey" }`) or, as a resilient fallback, by its name.
 */
export type HomeTheme = {
  slug: string
  name: string
  radius: number
  colors: {
    primary: string
    primarySoft: string
    primaryDeep: string
    accent: string
    tint: string
    background: string
    surface: string
    line: string
    secondary: string
    sidebar: string
    sidebarAccent: string
    sidebarForeground: string
    sidebarBorder: string
    primaryForeground: string
  }
}

/**
 * Tony Stacey Centre for Veterans' Care — a crimson "pharmacy" skin inspired by the
 * client's preferred brand palette. White surfaces, soft pink tints and rounded cards.
 */
const TONY_STACEY: HomeTheme = {
  slug: 'tony-stacey',
  name: "Tony Stacey Centre for Veterans' Care",
  radius: 0.5,
  colors: {
    primary: '#c0123c',
    primarySoft: '#d14a6e',
    primaryDeep: '#8c0c2b',
    accent: '#d81e5b',
    tint: '#fbe6ee',
    background: '#f6f5f6',
    surface: '#ffffff',
    line: '#e7dce0',
    secondary: '#f1e9ec',
    sidebar: '#b00f36',
    sidebarAccent: '#8c0c2b',
    sidebarForeground: '#ffe8ee',
    sidebarBorder: 'rgba(255, 255, 255, 0.18)',
    primaryForeground: '#ffffff',
  },
}

/** Registry of every custom home theme. Add one entry per home that needs its own look. */
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
 * slug), otherwise the home's name is matched against the registry.
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

/** Converts a theme into the CSS custom properties that drive the design tokens. */
export function themeStyle(theme: HomeTheme): CSSProperties {
  const c = theme.colors
  const vars: Record<string, string> = {
    '--cream': c.background,
    '--paper': c.surface,
    '--forest': c.primary,
    '--forest-soft': c.primarySoft,
    '--forest-deep': c.primaryDeep,
    '--terracotta': c.accent,
    '--mint': c.tint,
    '--hairline': c.line,
    '--background': c.background,
    '--foreground': '#1b1416',
    '--card': c.surface,
    '--card-foreground': '#1b1416',
    '--popover': c.surface,
    '--popover-foreground': '#1b1416',
    '--primary': c.primary,
    '--primary-foreground': c.primaryForeground,
    '--secondary': c.secondary,
    '--secondary-foreground': c.primaryDeep,
    '--muted': c.secondary,
    '--muted-foreground': '#6b5f63',
    '--accent': c.tint,
    '--accent-foreground': c.primaryDeep,
    '--border': c.line,
    '--input': c.line,
    '--ring': c.primarySoft,
    '--sidebar': c.sidebar,
    '--sidebar-foreground': c.sidebarForeground,
    '--sidebar-primary': c.primaryForeground,
    '--sidebar-primary-foreground': c.sidebar,
    '--sidebar-accent': c.sidebarAccent,
    '--sidebar-accent-foreground': '#ffffff',
    '--sidebar-border': c.sidebarBorder,
    '--sidebar-ring': c.primarySoft,
    '--radius': `${theme.radius}rem`,
  }
  return vars as unknown as CSSProperties
}
