/**
 * send-push — Supabase Edge Function (Deno).
 *
 * The one and only sending half of portal chat push notifications, shared by this
 * portal and the Pharma Portal (both write to public.portal_messages in the same
 * database). It is invoked by the `portal_messages_send_push` database trigger
 * (pg_net, fire-and-forget) — see supabase/migrations/20261016000000_push_subscriptions.sql.
 *
 * Requires these Edge Function secrets (Dashboard → Edge Functions → Manage secrets):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * The private key is a server secret: it is read from the environment only and is never
 * returned, logged, echoed, or bundled into any client.
 *
 * Two callers, both authenticated with the service-role key:
 *   • the trigger, with a `portal_messages` record — notifies that thread's other side;
 *   • the portal's own "send a test alert" button, with `{ test: true, user_id }` — sends
 *     one alert to that account's own devices, so a phone or desktop can be proven
 *     end-to-end without waiting for a real reply.
 *
 * Privacy: this is a healthcare setting. Only approved generic strings are ever sent —
 * "New message" with a body that starts with "You have a new message", or the test copy.
 * Message bodies, resident names and medication names are never included, and the client
 * service worker discards anything that is not one of the approved strings.
 *
 * The function never throws in a way that can affect the message insert (the trigger is
 * asynchronous), and each push is best-effort: a failure for one device never stops the
 * others.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import webpushImport from 'npm:web-push@3.6.7'

// `web-push` is CommonJS; unwrap it whichever way the Deno npm interop hands it over.
const webpush = (webpushImport as { default?: typeof webpushImport }).default ?? webpushImport

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_SUBJECT = (Deno.env.get('VAPID_SUBJECT') ?? 'mailto:param@pharmastrategies.ca').trim()
// `.replace(/\s+/g, '')` rather than `.trim()`: a key pasted from a wrapped terminal line
// carries a newline inside it, which trim() would leave behind and web-push would reject.
const VAPID_PUBLIC_KEY = (Deno.env.get('VAPID_PUBLIC_KEY') ?? '').replace(/\s+/g, '')
const VAPID_PRIVATE_KEY = (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').replace(/\s+/g, '')

/** Generic, non-clinical copy. Anything derived from the message body stays here. */
const TITLE = 'New message'
const BODY_DEFAULT = 'You have a new message'
const BODY_FROM_PHARMACY = 'You have a new message from the pharmacy'
/** The only non-message alert: the portal's own "send a test alert" button. */
const TEST_TITLE = 'Message alerts are on'
const TEST_BODY = 'Test alert from your pharmacy portal'
/** `/chat` is the shared chat path; each origin's service worker maps it to its own route. */
const CLICK_URL = '/chat'

const json = (body: unknown, status = 200) => {
  // Step 4: one line per invocation, so the Edge Function logs always answer the first
  // question — "was this function even called?" The body never contains the VAPID private
  // key (it is only ever read from the environment and passed to web-push).
  console.log('send-push:', status, JSON.stringify(body))
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

type SubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  tenant_id: string | null
}

type DeliveryResult = { sent: number; pruned: number; failed: number; lastStatus: number }

/** Only the platform-verified service-role key may call this function. */
function callerRole(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  const payload = token.split('.')[1]
  if (!payload) return ''
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const claims = JSON.parse(atob(padded)) as { role?: unknown }
    return typeof claims.role === 'string' ? claims.role : ''
  } catch {
    return ''
  }
}

/** The accounts that make up the pharmacy side of a conversation (the pharmacy console). */
const PHARMACY_ROLES = ['pharmacy', 'admin']

async function recipientsFor(
  supabase: ReturnType<typeof createClient>,
  { senderRole, homeId, senderId }: { senderRole: string; homeId: string; senderId: string },
): Promise<string[]> {
  // Both branches are already tenant-scoped by the thread's home.
  if (senderRole === 'pharmacy') {
    // Pharmacy-sent: everyone at that nursing home.
    const { data, error } = await supabase.from('profiles').select('id').eq('home_id', homeId)
    if (error) return []
    return (data ?? []).map((row) => String(row.id))
  }

  // Home-sent: whoever runs the pharmacy console. This used to read a `pharmacy_home_access`
  // table, but nothing in this database ever created it — so the lookup errored, the
  // recipient list came back empty, and every home-sent message notified nobody (the trigger
  // then recorded `{"ok":true,"sent":0,"reason":"no_recipients"}` in net._http_response).
  const { data, error } = await supabase.from('profiles').select('id, role')
  if (error) return []
  return (data ?? [])
    .filter((row) => PHARMACY_ROLES.includes(String((row as { role?: unknown }).role ?? '').toLowerCase()))
    .map((row) => String(row.id))
}

/**
 * Sends one payload to every subscription given, and reports what the push service said.
 *
 * `restrictToHomeId` filters out devices that belong to a *different* home. It is set when
 * the recipients are that home's own portal users, and null when they are not tenant-scoped
 * at all — pharmacy-side staff (who serve every home) and the caller's own devices for a
 * test alert.
 *
 * Getting this wrong is a silent failure: a pharmacy account whose profile carries a
 * `home_id` gets that tenant stamped on its subscriptions, so scoping it to the thread's home
 * drops every message from any other home and reports `sent: 0` with no error at all.
 */
async function deliver(
  supabase: ReturnType<typeof createClient>,
  rows: SubscriptionRow[],
  payload: string,
  restrictToHomeId: string | null,
): Promise<DeliveryResult> {
  let sent = 0
  let pruned = 0
  let failed = 0
  let lastStatus = 0

  for (const row of rows) {
    // Same home only. Rows written before a tenant existed (null) are kept.
    if (restrictToHomeId && row.tenant_id && String(row.tenant_id) !== restrictToHomeId) continue
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      )
      sent++
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode ?? 0
      lastStatus = statusCode
      // 404/410 mean the subscription is gone (uninstalled, revoked, expired).
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', row.id)
        pruned++
      } else {
        failed++
      }
    }
  }

  return { sent, pruned, failed, lastStatus }
}

const SUBSCRIPTION_COLUMNS = 'id, endpoint, p256dh, auth, tenant_id'

Deno.serve(async (request) => {
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (callerRole(request) !== 'service_role') return json({ error: 'Forbidden' }, 403)
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, reason: 'not_configured' })
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ ok: false, reason: 'no_vapid_keys' })
    // A mistyped or line-wrapped key pair (a common paste accident) makes web-push throw on
    // every send, which looks exactly like "notifications do nothing". Say so instead.
    if (VAPID_PUBLIC_KEY.length < 80 || VAPID_PRIVATE_KEY.length < 40) {
      console.error('send-push: VAPID key lengths look wrong', {
        publicLength: VAPID_PUBLIC_KEY.length,
        privateLength: VAPID_PRIVATE_KEY.length,
      })
      return json({ ok: false, reason: 'bad_vapid_keys' })
    }

    try {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    } catch {
      console.error('send-push: setVapidDetails rejected the configured keys')
      return json({ ok: false, reason: 'bad_vapid_keys' })
    }

    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
    // Accepts the plain trigger payload, and the Supabase Database Webhook shape.
    const record = ((raw?.record ?? raw) ?? null) as Record<string, unknown> | null
    if (!record) return json({ ok: true, sent: 0, reason: 'no_payload' })

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Self-test: one account proves its own device works, with no message involved. Only a
    // service-role caller (the portal's server route, which has already identified the
    // signed-in user) can ask for this, so the id it passes is trusted.
    if (record.test === true) {
      const targetUser = typeof record.user_id === 'string' ? record.user_id : ''
      if (!targetUser) return json({ ok: false, reason: 'no_target_user' }, 400)

      const { data: ownRows, error: ownError } = await supabase
        .from('push_subscriptions')
        .select(SUBSCRIPTION_COLUMNS)
        .eq('user_id', targetUser)
      if (ownError) return json({ ok: false, reason: 'subscription_lookup_failed' })
      if (!ownRows || ownRows.length === 0) return json({ ok: false, reason: 'no_subscriptions' })

      const result = await deliver(
        supabase,
        ownRows as SubscriptionRow[],
        JSON.stringify({ title: TEST_TITLE, body: TEST_BODY, data: { url: CLICK_URL } }),
        null,
      )
      return json({ ok: true, ...result })
    }

    let threadId = typeof record.thread_id === 'string' ? record.thread_id : ''
    let senderRole = typeof record.sender_role === 'string' ? record.sender_role : ''
    let senderId = typeof record.user_id === 'string' ? record.user_id : ''

    // Prefer the row itself, so a stale or forged payload can never mis-route a push.
    if (typeof record.id === 'string' && record.id) {
      const { data: message } = await supabase
        .from('portal_messages')
        .select('id, thread_id, user_id, sender_role')
        .eq('id', record.id)
        .maybeSingle()
      if (message) {
        threadId = String(message.thread_id ?? threadId)
        senderRole = String(message.sender_role ?? senderRole)
        senderId = String(message.user_id ?? senderId)
      }
    }

    if (!threadId || !senderId) return json({ ok: true, sent: 0, reason: 'incomplete' })
    if (senderRole !== 'home' && senderRole !== 'pharmacy') return json({ ok: true, sent: 0, reason: 'unknown_sender' })

    const { data: thread } = await supabase
      .from('chat_threads')
      .select('id, home_id, pharmacy_id')
      .eq('id', threadId)
      .maybeSingle()
    const homeId = thread?.home_id ? String(thread.home_id) : ''
    if (!homeId) return json({ ok: true, sent: 0, reason: 'no_tenant' })

    const recipientIds = (await recipientsFor(supabase, { senderRole, homeId, senderId })).filter(
      (id) => id && id !== senderId,
    )
    if (recipientIds.length === 0) return json({ ok: true, sent: 0, reason: 'no_recipients' })

    const { data: subscriptionRows, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .in('user_id', recipientIds)
    if (subscriptionError || !subscriptionRows || subscriptionRows.length === 0) {
      return json({ ok: true, sent: 0, reason: 'no_subscriptions' })
    }

    let body = BODY_DEFAULT
    if (senderRole === 'pharmacy') {
      let pharmacyName = ''
      if (thread?.pharmacy_id) {
        const { data: pharmacy } = await supabase
          .from('pharmacies')
          .select('name')
          .eq('id', thread.pharmacy_id)
          .maybeSingle()
        pharmacyName = typeof pharmacy?.name === 'string' ? pharmacy.name.trim().slice(0, 60) : ''
      }
      body = pharmacyName ? `You have a new message from ${pharmacyName}` : BODY_FROM_PHARMACY
    }

    // Home users are scoped to the thread's own home — a home must never be notified about
    // another home's messages. Pharmacy-side recipients serve every home and must not be
    // scoped, or a pharmacy account with a `home_id` on its profile receives nothing from
    // the other homes.
    const restrictToHomeId = senderRole === 'pharmacy' ? homeId : null

    const result = await deliver(
      supabase,
      subscriptionRows as SubscriptionRow[],
      JSON.stringify({ title: TITLE, body, data: { url: CLICK_URL } }),
      restrictToHomeId,
    )
    return json({ ok: true, ...result })
  } catch (error) {
    // Never surface internals (and never the VAPID private key) to the caller.
    console.error('send-push failed:', (error as Error)?.name ?? 'unknown error')
    return json({ ok: false, reason: 'unexpected_error' })
  }
})
