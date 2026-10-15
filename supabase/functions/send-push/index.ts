/**
 * send-push — Supabase Edge Function (Deno).
 *
 * The one and only sending half of portal chat push notifications, shared by this
 * portal and the Pharma Portal (both write to public.portal_messages in the same
 * database). It is invoked by the `portal_messages_send_push` database trigger
 * (pg_net, fire-and-forget) — see supabase/migrations/20261016000000_push_subscriptions.sql —
 * and by a Database Webhook on public.portal_messages INSERT, if one is configured.
 *
 * BOTH DIRECTIONS are handled here. The recipient side is the side that did NOT send:
 *   • sender_role = 'pharmacy' → the home's users (profiles.home_id = thread.home_id);
 *   • sender_role = 'home'     → the pharmacy side of that conversation.
 *
 * A third, message-free mode answers the portal's "do our two keys agree?" question: a
 * service-role call with `{ diagnose: true }` returns the PUBLIC half of the VAPID pair this
 * function signs with (plus key lengths), so a refused send can be told apart from a broken
 * pair. The public key is not a secret — every browser sends it to its push service with
 * every subscribe — and VAPID_PRIVATE_KEY is still never returned, logged or echoed.
 *
 * Requires these Edge Function secrets (Dashboard → Edge Functions → Manage secrets):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * Optional:
 *   PUSH_WEBHOOK_SECRET — when set, every trigger/webhook call must carry it in the
 *   `x-webhook-secret` header, or it is refused with 403. Leave it unset and nothing
 *   changes. The portal's own "send a test alert" path never sends it and is exempt.
 *
 * VAPID_PUBLIC_KEY must be byte-for-byte the key the Pharma Portal inlines as
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY, with VAPID_PRIVATE_KEY as its matching half — a
 * subscription is bound to the key that created it, so a mismatch means the push service
 * refuses every send (403) and nothing ever decrypts. Keys live in secrets only; they are
 * never in this file, never logged, never returned.
 *
 * Privacy: this is a healthcare setting. Only approved generic strings are ever sent —
 * "New message" with a body that starts with "You have a new message", or the test copy.
 * Message bodies, resident names and medication names are never included, and each portal's
 * service worker discards anything that is not one of its approved strings.
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
/** Optional. When present, trigger/webhook calls must carry this in `x-webhook-secret`. */
const WEBHOOK_SECRET = (Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '').trim()

/** Generic, non-clinical copy. Anything derived from the message body stays out of here. */
const TITLE = 'New message'
const BODY_DEFAULT = 'You have a new message'
const BODY_FROM_PHARMACY = 'You have a new message from the pharmacy'
/** Home-sent: the pharmacy console reads this. Still generic — no home, person or medicine. */
const BODY_FROM_HOME = 'You have a new message from the nursing home'
/** The only non-message alert: the portal's own "send a test alert" button. */
const TEST_TITLE = 'Message alerts are on'
const TEST_BODY = 'Test alert from your pharmacy portal'
/** `/chat` is the shared chat path; each origin's service worker maps it to its own route. */
const CLICK_URL = '/chat'
/** Notification grouping tag, so several alerts collapse into one per device. */
const TAG = 'pharma-portal-message'

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

/** Accounts that run the pharmacy console when no explicit per-home grant exists. */
const PHARMACY_ROLES = ['pharmacy', 'admin']

/** One place a recipient id came from, so a "0 recipients" log says which lookup failed. */
type RecipientSource = { from: string; found: number }

/**
 * The user ids that should be notified for this message — the side that did NOT send it.
 *
 * Home-sent (the direction that used to notify nobody): the pharmacy side is resolved from
 * up to three sources and the results are unioned, so this works whether or not the database
 * has an explicit grant table:
 *   1. `pharmacy_home_access(pharmacy_user_id, home_id)` — the explicit grant, when the table
 *      exists. Some deployments never created it, so a missing table is not fatal: it is
 *      logged and the other two sources still apply;
 *   2. `profiles.role in ('pharmacy','admin')` — the pharmacy console accounts;
 *   3. `profiles.pharmacy_id = chat_threads.pharmacy_id` — staff of the thread's own pharmacy.
 *
 * The author is always excluded: the same account can be signed in on both portals, and
 * nobody needs an alert for the message they just wrote.
 */
async function recipientsFor(
  supabase: ReturnType<typeof createClient>,
  {
    senderRole,
    homeId,
    pharmacyId,
    senderId,
    threadId,
  }: { senderRole: string; homeId: string; pharmacyId: string; senderId: string; threadId: string },
): Promise<string[]> {
  const sources: Array<{ label: string; ids: string[] }> = []

  if (senderRole === 'pharmacy') {
    // Pharmacy-sent: everyone at that nursing home.
    const { data, error } = await supabase.from('profiles').select('id').eq('home_id', homeId)
    if (error) {
      console.error('[send-push] home recipient lookup failed:', error.message)
    } else {
      sources.push({ label: 'profiles.home_id', ids: (data ?? []).map((row) => String(row.id)) })
    }
  } else {
    // Home-sent: the pharmacy console. Source 1 — the explicit grant table.
    const access = await supabase
      .from('pharmacy_home_access')
      .select('pharmacy_user_id')
      .eq('home_id', homeId)
    if (access.error) {
      // Expected on databases that never created that table; the other sources cover it.
      console.log(
        '[send-push] pharmacy_home_access unavailable, using profiles.role and profiles.pharmacy_id:',
        access.error.message,
      )
    } else {
      sources.push({
        label: 'pharmacy_home_access',
        ids: (access.data ?? []).map((row) => String((row as { pharmacy_user_id?: unknown }).pharmacy_user_id ?? '')),
      })
    }

    // Source 2 — the pharmacy console accounts.
    const staff = await supabase.from('profiles').select('id, role')
    if (staff.error) {
      console.error('[send-push] pharmacy role lookup failed:', staff.error.message)
    } else {
      sources.push({
        label: 'profiles.role',
        ids: (staff.data ?? [])
          .filter((row) => PHARMACY_ROLES.includes(String((row as { role?: unknown }).role ?? '').toLowerCase()))
          .map((row) => String(row.id)),
      })
    }

    // Source 3 — staff belonging to the pharmacy that owns this thread.
    if (pharmacyId) {
      const owned = await supabase.from('profiles').select('id').eq('pharmacy_id', pharmacyId)
      if (owned.error) {
        console.error('[send-push] profiles.pharmacy_id lookup failed:', owned.error.message)
      } else {
        sources.push({ label: 'profiles.pharmacy_id', ids: (owned.data ?? []).map((row) => String(row.id)) })
      }
    }
  }

  const seen = new Set<string>()
  const ids: string[] = []
  for (const source of sources) {
    for (const id of source.ids) {
      if (!id || id === senderId || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }

  // One line that answers "why did nobody get it?" without reading any further.
  console.log(
    '[send-push] recipients',
    JSON.stringify({
      senderRole,
      homeId,
      pharmacyId: pharmacyId || null,
      perSource: sources.map((source): RecipientSource => ({ from: source.label, found: source.ids.length })),
      notified: ids.length,
    }),
  )
  if (ids.length === 0) console.log('[send-push] no recipients', JSON.stringify({ senderRole, homeId, threadId }))
  return ids
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
      const prunable = statusCode === 404 || statusCode === 410
      // An endpoint is a capability URL, so only its host is logged. 403 here means the
      // subscription was created with a different VAPID key than the one signing now.
      console.warn(
        '[send-push] send error',
        JSON.stringify({ statusCode, host: endpointHost(row.endpoint), prune: prunable }),
      )
      // 404/410 mean the subscription is gone (uninstalled, revoked, expired).
      if (prunable) {
        await supabase.from('push_subscriptions').delete().eq('id', row.id)
        pruned++
      } else {
        failed++
      }
    }
  }

  return { sent, pruned, failed, lastStatus }
}

/** The push service host only — never the whole endpoint, which is a capability URL. */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'invalid-endpoint'
  }
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
    // Accepts the plain trigger payload, and the Supabase Database Webhook shape
    // { type, table, schema, record, old_record }.
    const record = ((raw?.record ?? raw) ?? null) as Record<string, unknown> | null
    if (!record) return json({ ok: true, sent: 0, reason: 'no_payload' })

    const isTestCall = record.test === true
    const isDiagnoseCall = record.diagnose === true
    // The portal's own two calls (test alert, key diagnosis) are authenticated by the
    // service-role key instead, so they carry no webhook secret and are exempt from it.
    const isPortalCall = isTestCall || isDiagnoseCall
    // Optional shared secret, enforced ONLY when it is configured — so a deployment that has
    // not set PUSH_WEBHOOK_SECRET keeps working exactly as before. The portal's own test
    // button cannot send a header (it is authenticated by the service-role key instead), so
    // it is exempt; if the secret is set, the trigger/webhook must send the header too.
    if (WEBHOOK_SECRET && !isPortalCall && request.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      console.warn('[send-push] rejected: missing or wrong x-webhook-secret header')
      return json({ error: 'Forbidden' }, 403)
    }

    // Key diagnosis: the portal's public key and this function's VAPID_PUBLIC_KEY must be the
    // same value, or the push service answers 403 to every send while the device still looks
    // subscribed. Only the public half is reported here — it is public by design.
    if (isDiagnoseCall) {
      console.log(
        '[send-push] diagnose',
        JSON.stringify({ publicKeyLength: VAPID_PUBLIC_KEY.length, privateKeyLength: VAPID_PRIVATE_KEY.length }),
      )
      return json({
        ok: true,
        publicKey: VAPID_PUBLIC_KEY,
        publicKeyLength: VAPID_PUBLIC_KEY.length,
        privateKeyLength: VAPID_PRIVATE_KEY.length,
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Self-test: one account proves its own device works, with no message involved. Only a
    // service-role caller (the portal's server route, which has already identified the
    // signed-in user) can ask for this, so the id it passes is trusted.
    if (isTestCall) {
      const targetUser = typeof record.user_id === 'string' ? record.user_id : ''
      if (!targetUser) return json({ ok: false, reason: 'no_target_user' }, 400)

      const { data: ownRows, error: ownError } = await supabase
        .from('push_subscriptions')
        .select(SUBSCRIPTION_COLUMNS)
        .eq('user_id', targetUser)
      if (ownError) return json({ ok: false, reason: 'subscription_lookup_failed' })
      if (!ownRows || ownRows.length === 0) {
        console.log('[send-push] no subscriptions', JSON.stringify({ test: true }))
        return json({ ok: false, reason: 'no_subscriptions' })
      }

      const result = await deliver(
        supabase,
        ownRows as SubscriptionRow[],
        JSON.stringify({ title: TEST_TITLE, body: TEST_BODY, data: { url: CLICK_URL } }),
        null,
      )
      console.log('[send-push] done', JSON.stringify({ direction: 'test', ...result }))
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
    const pharmacyId = thread?.pharmacy_id ? String(thread.pharmacy_id) : ''
    if (!homeId) return json({ ok: true, sent: 0, reason: 'no_tenant' })

    const recipientIds = await recipientsFor(supabase, { senderRole, homeId, pharmacyId, senderId, threadId })
    if (recipientIds.length === 0) return json({ ok: true, sent: 0, reason: 'no_recipients' })

    const { data: subscriptionRows, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .in('user_id', recipientIds)
    if (subscriptionError) {
      console.error('[send-push] subscription lookup failed:', subscriptionError.message)
      return json({ ok: true, sent: 0, reason: 'subscription_lookup_failed' })
    }
    if (!subscriptionRows || subscriptionRows.length === 0) {
      console.log('[send-push] no subscriptions', JSON.stringify({ recipients: recipientIds.length }))
      return json({ ok: true, sent: 0, reason: 'no_subscriptions' })
    }

    // The body names the *sender's* side, so the reader knows which way the message came.
    // Pharmacy-sent keeps its existing behaviour: the pharmacy's own name when the thread
    // carries one. Home-sent uses the fixed generic line.
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
    } else {
      body = BODY_FROM_HOME
    }

    // Home users are scoped to the thread's own home — a home must never be notified about
    // another home's messages. Pharmacy-side recipients serve every home and must not be
    // scoped, or a pharmacy account with a `home_id` on its profile receives nothing from
    // the other homes.
    const restrictToHomeId = senderRole === 'pharmacy' ? homeId : null

    const result = await deliver(
      supabase,
      subscriptionRows as SubscriptionRow[],
      JSON.stringify({ title: TITLE, body, tag: TAG, data: { url: CLICK_URL } }),
      restrictToHomeId,
    )
    console.log(
      '[send-push] done',
      JSON.stringify({ direction: senderRole === 'home' ? 'home→pharmacy' : 'pharmacy→home', ...result }),
    )
    return json({ ok: true, ...result })
  } catch (error) {
    // Never surface internals (and never the VAPID private key) to the caller.
    console.error('send-push failed:', (error as Error)?.name ?? 'unknown error')
    return json({ ok: false, reason: 'unexpected_error' })
  }
})
