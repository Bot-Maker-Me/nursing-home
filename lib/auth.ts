import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type PortalProfile = {
  full_name: string | null
  role: string | null
  home_name: string | null
  home_id: string | null
}

export type CurrentHome = { name: string; theme: unknown }

/**
 * Request-scoped auth data. `cache` memoises these for the duration of a single server
 * request, so a layout and the page it renders share ONE `auth.getUser()` call and ONE
 * profile query instead of each running their own. That removes duplicate round trips
 * from every portal render, which is the cheapest, highest-leverage speed win.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getPortalProfile = cache(async (): Promise<PortalProfile | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, role, home_name, home_id')
    .eq('id', user.id)
    .maybeSingle()
  return (data as PortalProfile | null) ?? null
})

/**
 * The signed-in user's home (name + custom theme). Falls back to a name-only lookup if
 * the `theme` column is not present yet, so this never fails a page render.
 */
export const getCurrentHome = cache(async (): Promise<CurrentHome | null> => {
  const profile = await getPortalProfile()
  if (!profile?.home_id) return null
  const supabase = await createClient()
  const withTheme = await supabase.from('homes').select('name, theme').eq('id', profile.home_id).maybeSingle()
  if (!withTheme.error && withTheme.data) {
    return { name: withTheme.data.name as string, theme: withTheme.data.theme ?? null }
  }
  const withoutTheme = await supabase.from('homes').select('name').eq('id', profile.home_id).maybeSingle()
  return withoutTheme.data ? { name: withoutTheme.data.name as string, theme: null } : null
})

/**
 * THE active-tenant name. Every breadcrumb, heading and tenant label must read from this
 * one helper, so they can never disagree. The `homes` row (linked by `profiles.home_id`)
 * is authoritative; `profiles.home_name` is a denormalised copy that can drift, so it is
 * only a fallback when the account has no home linked yet.
 */
export const getTenantName = cache(async (): Promise<string> => {
  const home = await getCurrentHome()
  if (home?.name) return home.name
  const profile = await getPortalProfile()
  return profile?.home_name || 'Your home'
})
