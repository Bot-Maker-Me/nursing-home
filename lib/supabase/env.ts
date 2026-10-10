// Single source of truth for Supabase connection values.
// The URL and anon key are public by design (protected by Row Level Security),
// so they are safe as fallbacks when environment variables are not injected.

const DEFAULT_SUPABASE_URL = 'https://ayvpdpthxwplbsmhpbva.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dnBkcHRoeHdwbGJzbWhwYnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4Njg1MDksImV4cCI6MjEwNjQ0NDUwOX0.NwJLEvo9SqAJgp-V3Yh3bGbqlTFf51BI5Oxh0joaFtw'

// Pick the first value that is actually present. Empty and whitespace-only
// environment variables are treated as "not set": `??` would keep an empty string,
// which makes Supabase requests go out with no `apikey` header.
function firstSet(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export const SUPABASE_URL =
  firstSet(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL) ?? DEFAULT_SUPABASE_URL

export const SUPABASE_ANON_KEY =
  firstSet(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.JWT,
  ) ?? DEFAULT_SUPABASE_ANON_KEY
