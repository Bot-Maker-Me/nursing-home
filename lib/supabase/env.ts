// Single source of truth for Supabase connection values.
// The URL and anon key are public by design (protected by Row Level Security),
// so they are safe as fallbacks when environment variables are not injected.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ayvpdpthxwplbsmhpbva.supabase.co'

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.JWT ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dnBkcHRoeHdwbGJzbWhwYnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4Njg1MDksImV4cCI6MjEwNjQ0NDUwOX0.NwJLEvo9SqAJgp-V3Yh3bGbqlTFf51BI5Oxh0joaFtw'
