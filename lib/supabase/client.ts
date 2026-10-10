import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env'

export const supabaseUrl = SUPABASE_URL
export const supabasePublishableKey = SUPABASE_ANON_KEY

let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabasePublishableKey)
  }
  return browserClient
}
