import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPABASE_URL } from '@/lib/supabase/env'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Mirrors lib/supabase/admin.ts — the key stays on the server, never in the browser.
 * Whitespace is stripped because a JWT never contains any, and an env var pasted from a
 * wrapped line would otherwise produce an invalid `authorization` header and a request
 * that fails before it reaches Supabase — the same failure the Vault secret can hit.
 */
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2 ?? '').replace(/\s+/g, '')
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`

type FunctionResult = {
  ok?: boolean
  sent?: number
  failed?: number
  lastStatus?: number
  reason?: string
}

/**
 * Reasons only the message path can return. Seeing one of these in reply to a test means
 * the deployed function predates test mode and never looked at the device at all.
 */
const MESSAGE_PATH_REASONS = ['incomplete', 'no_payload', 'no_tenant', 'no_recipients', 'unknown_sender']

/** Turns the function's short reason codes into something a nurse can act on. */
function explain(reason: string | undefined): string {
  switch (reason) {
    case 'bad_vapid_keys':
      return 'The notification keys stored on the server do not match this portal, so every alert is refused. The pharmacy’s administrator needs to update the VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets on the send-push function.'
    case 'no_vapid_keys':
      return 'The notification keys are missing from the send-push function secrets. The pharmacy’s administrator needs to add them.'
    case 'not_configured':
      return 'The notification service is not configured on the server yet.'
    case 'subscription_lookup_failed':
      return 'The notification records could not be read. Check that the push migration has been applied in Supabase.'
    case 'unexpected_error':
      return 'The notification service hit an unexpected error. Its logs will have the detail.'
    default:
      return 'The notification service could not deliver the alert. Its logs will have the detail.'
  }
}

/**
 * Sends one generic test alert to the signed-in user's own devices.
 *
 * A real push only happens when the pharmacy replies, which makes "nothing arrived" hard
 * to diagnose: it could be no device registered, missing secrets, or a key mismatch. This
 * separates those cases and reports which one it is, so a device can be proven to work
 * without waiting for a message.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitResult = await rateLimit(`push-test:${user.id}`, { limit: 10, windowSeconds: 3600 })
  if (!limitResult.ok) return rateLimitResponse(limitResult)

  if (!SERVICE_KEY) {
    return NextResponse.json({ error: 'Notification testing is not configured on the server.' }, { status: 503 })
  }

  // Count this account's opted-in devices first: "no device registered" and "the send was
  // refused" are different problems with different fixes.
  const { count, error: countError } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if (countError) {
    return NextResponse.json(
      { error: 'Notification settings are not available until the push migration is applied.' },
      { status: 503 },
    )
  }
  if (!count) {
    return NextResponse.json(
      { error: 'No device is turned on for alerts on this account yet. Enable notifications here first.' },
      { status: 400 },
    )
  }

  const response = await fetch(SEND_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ test: true, user_id: user.id }),
  }).catch(() => null)

  if (!response) {
    return NextResponse.json(
      { error: 'The notification service could not be reached. Check that the send-push function is deployed.' },
      { status: 502 },
    )
  }

  const result = (await response.json().catch(() => null)) as FunctionResult | null

  // Supabase's own gateway rejects the call before the function runs when the key is stale.
  if (response.status === 401 || response.status === 403) {
    return NextResponse.json(
      {
        error:
          'Supabase rejected the server key used for notifications. Check that SUPABASE_SERVICE_ROLE_KEY matches the project’s current service-role key.',
        reason: 'bad_service_key',
      },
      { status: 502 },
    )
  }

  if (!result?.ok) {
    return NextResponse.json({ error: explain(result?.reason), reason: result?.reason ?? 'unknown' }, { status: 502 })
  }
  if (!result.sent) {
    if (result.reason && MESSAGE_PATH_REASONS.includes(result.reason)) {
      return NextResponse.json(
        {
          error:
            'The send-push function running in Supabase is an older version that cannot send test alerts. Redeploy supabase/functions/send-push/index.ts.',
          reason: 'function_outdated',
        },
        { status: 502 },
      )
    }
    // The device is registered but the push service would not take it. 403 here almost
    // always means the subscription was created against a different VAPID key.
    return NextResponse.json(
      {
        error: 'The push service refused the alert for this device. Turn notifications off and on again here, then retry.',
        reason: 'refused',
        lastStatus: result.lastStatus ?? 0,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, sent: result.sent })
}
