import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | undefined

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ayvpdpthxwplbsmhpbva.supabase.co'
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dnBkcHRoeHdwbGJzbWhwYnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4Njg1MDksImV4cCI6MjEwNjQ0NDUwOX0.NwJLEvo9SqAJgp-V3Yh3bGbqlTFf51BI5Oxh0joaFtw'

export function createClient() {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ayvpdpthxwplbsmhpbva.supabase.co'
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dnBkcHRoeHdwbGJzbWhwYnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4Njg1MDksImV4cCI6MjEwNjQ0NDUwOX0.NwJLEvo9SqAJgp-V3Yh3bGbqlTFf51BI5Oxh0joaFtw'
    browserClient = createBrowserClient(url, publishableKey)
  }
  return browserClient
}
