import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

const MAX_ENDPOINT_LENGTH = 2048

/**
 * Stores a device's Web Push subscription for the signed-in user.
 *
 * The tenant (`profiles.home_id`) is resolved here, server-side, so a client can never
 * claim a subscription belongs to another home. Row-level security additionally confines
 * every write to the caller's own rows.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitResult = await rateLimit(`push-subscribe:${user.id}`, { limit: 20, windowSeconds: 3600 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  const body = await request.json().catch(() => null)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : ''
  const p256dh = typeof body?.p256dh === 'string' ? body.p256dh.trim() : ''
  const auth = typeof body?.auth === 'string' ? body.auth.trim() : ''
  const userAgent = typeof body?.userAgent === 'string' ? body.userAgent.trim().slice(0, 300) : null

  if (!endpoint.startsWith('https://') || endpoint.length > MAX_ENDPOINT_LENGTH || !p256dh || !auth) {
    return NextResponse.json({ error: 'That push subscription is not valid.' }, { status: 400 })
  }

  const { data: profile } = await supabase.from('profiles').select('home_id').eq('id', user.id).maybeSingle()

  // Re-registering the same browser replaces the previous row (endpoint is unique).
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      tenant_id: profile?.home_id ?? null,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    // A save that fails silently is indistinguishable from one that never ran, so the
    // reason is logged here (the endpoint is not sensitive, the keys are never logged).
    console.error('[push] saving the subscription failed:', error.code ?? 'unknown', error.message)
    return NextResponse.json({ error: 'Notifications are not available until the push migration is applied.' }, { status: 503 })
  }
  console.info('[push] subscription saved for', user.id, '→ tenant', profile?.home_id ?? 'none')
  return NextResponse.json({ ok: true })
}

/**
 * Reports whether this device's endpoint is already stored for the signed-in user.
 *
 * Subscribed in the browser and saved in the database are different facts, so the Account
 * page's diagnostic asks the server instead of guessing. The endpoint is the caller's own
 * and RLS confines the read to their rows.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const endpoint = new URL(request.url).searchParams.get('endpoint')?.trim() ?? ''
  if (!endpoint) return NextResponse.json({ error: 'A subscription endpoint is required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (error) {
    console.error('[push] reading the subscription failed:', error.code ?? 'unknown', error.message)
    return NextResponse.json(
      { error: 'Notification settings are not available until the push migration is applied.' },
      { status: 503 },
    )
  }
  return NextResponse.json({ saved: Boolean(data) })
}

/** Removes this device's subscription when notifications are turned off. */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitResult = await rateLimit(`push-unsubscribe:${user.id}`, { limit: 60, windowSeconds: 3600 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  const body = await request.json().catch(() => null)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : ''
  if (!endpoint) return NextResponse.json({ error: 'A subscription endpoint is required.' }, { status: 400 })

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
  if (error) {
    return NextResponse.json({ error: 'That subscription could not be removed.' }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
