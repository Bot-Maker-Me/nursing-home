import { NextResponse } from 'next/server'

// Runtime env lookup. Bracket access is intentionally used so values are read from the
// running environment instead of being inlined at build time (the dot form is inlined).
function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const anonKey =
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
    readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    readEnv('SUPABASE_ANON_KEY')
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL') ?? readEnv('SUPABASE_URL')
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY') ?? readEnv('SUPABASE_SECRET_KEY')

  return NextResponse.json({
    // If you can see this field, the latest code is deployed. A 404 means it is not.
    build: 'client-key-audit-v1',
    env: {
      supabaseUrl: Boolean(url),
      anonKey: Boolean(anonKey),
      serviceRoleKey: Boolean(serviceKey),
    },
  })
}
