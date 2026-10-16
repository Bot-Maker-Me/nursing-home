/**
 * Web Push client helpers.
 *
 * The VAPID PUBLIC key is public by design — the browser sends it to the push service with
 * every subscribe request, so it is safe to ship in the JavaScript bundle (exactly like the
 * Supabase anon key in lib/supabase/env.ts).
 *
 * The matching VAPID PRIVATE key must NEVER appear here, in any NEXT_PUBLIC_* variable, or
 * in any client bundle. It lives only in the `send-push` Edge Function secrets.
 */

/**
 * THE one place this app reads its public key.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, but only when it can see the
 * literal member expression. A dynamic lookup such as `process.env[name]` is left untouched
 * and reads `undefined` in the browser — which is exactly how a deployment that has the
 * variable set still claims notifications are not configured. So the name is written out in
 * full, here and nowhere else, and no key is ever hardcoded as a fallback.
 */
const RAW_VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/**
 * A VAPID public key is 65 bytes: 87–88 URL-safe base64 characters, always starting with
 * 'B'. Anything else was mistyped, truncated, or pasted from a wrapped line — and a wrapped
 * terminal paste is the usual culprit — which makes `window.atob()` throw
 * InvalidCharacterError halfway through subscribing, with a message that hides the cause.
 */
const VAPID_KEY_MIN_LENGTH = 87
const VAPID_KEY_MAX_LENGTH = 88

/** Whitespace and line breaks are never part of a key, so dropping them undoes a bad paste. */
function trimVapidPublicKey(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, '')
}

function looksLikeVapidPublicKey(value: string): boolean {
  return (
    value.length >= VAPID_KEY_MIN_LENGTH &&
    value.length <= VAPID_KEY_MAX_LENGTH &&
    value.startsWith('B') &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

/** `missing` = nothing set · `invalid` = set but unusable · `configured` = usable. */
export type VapidKeyState = 'configured' | 'missing' | 'invalid'

const cleanedVapidPublicKey = trimVapidPublicKey(RAW_VAPID_PUBLIC_KEY)

export const VAPID_KEY_STATE: VapidKeyState = !cleanedVapidPublicKey
  ? 'missing'
  : looksLikeVapidPublicKey(cleanedVapidPublicKey)
    ? 'configured'
    : 'invalid'

/** The cleaned public key, or '' when it is missing or invalid. Never logged or displayed. */
export const VAPID_PUBLIC_KEY = VAPID_KEY_STATE === 'configured' ? cleanedVapidPublicKey : ''

if (VAPID_KEY_STATE !== 'configured') {
  // One line, once per server start / page load, so a misconfigured deployment is visible
  // in the logs without ever printing the value.
  console.warn(
    VAPID_KEY_STATE === 'missing'
      ? '[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set on this deployment; browser alerts stay disabled.'
      : '[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is set but is not a valid VAPID public key; browser alerts stay disabled.',
  )
}

export const VAPID_KEY_MISSING_MESSAGE =
  'Notifications are not configured on this deployment yet. An administrator needs to set the NEXT_PUBLIC_VAPID_PUBLIC_KEY environment variable.'

export const VAPID_KEY_INVALID_MESSAGE =
  'Notifications are misconfigured on this deployment: NEXT_PUBLIC_VAPID_PUBLIC_KEY is set, but it is not a valid VAPID public key. It must start with "B", be 87–88 URL-safe base64 characters long, and contain no spaces or line breaks.'

/** The message that fits the key state, so the UI can say which of the two problems it is. */
export function vapidKeyMessage(state: VapidKeyState = VAPID_KEY_STATE): string | null {
  if (state === 'missing') return VAPID_KEY_MISSING_MESSAGE
  if (state === 'invalid') return VAPID_KEY_INVALID_MESSAGE
  return null
}

export const SERVICE_WORKER_URL = '/sw.js'

/** How long to wait for the service worker to become active before giving up. */
const ACTIVATION_TIMEOUT_MS = 10_000

/** Shown on iOS Safari, where push only works from an installed Home Screen app. */
export const IOS_PUSH_HINT =
  'Tap Share, then Add to Home Screen, then open from the Home Screen to enable notifications.'

/** Shown when the portal is rendered inside another page (preview pane, iframe, embed). */
export const EMBED_HINT =
  'Open the portal in its own tab to enable notifications — browsers block the permission prompt inside an embedded page.'

/** True when this browser can do Web Push at all. */
export function supportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** iPhone/iPad Safari (iPadOS reports itself as a Mac, so it is detected by touch). */
export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Opened from the Home Screen (installed) rather than as a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return installed || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * True when the portal is inside another document (the workspace preview, an embed, an
 * iframe on a partner site). Browsers refuse the notification permission prompt there.
 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    // A cross-origin parent makes the comparison throw — that also means "framed".
    return true
  }
}

/** True when this registration is the portal's own push worker rather than another app's. */
export function isPushRegistration(registration: ServiceWorkerRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing
  if (!worker) return false
  try {
    return new URL(worker.scriptURL).pathname === SERVICE_WORKER_URL
  } catch {
    return false
  }
}

/**
 * The portal's own registration, ignoring any other worker that shares this origin.
 *
 * `navigator.serviceWorker.getRegistration()` is not enough: it hands back whichever
 * registration owns the current page's scope, so on an origin where something else already
 * registered a worker at `/` (the workspace preview does) it returns a worker with no `push`
 * handler at all — and a subscription made through that worker can never display anything.
 */
export async function findPushRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!supportsPush()) return undefined
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => [])
  return registrations.find(isPushRegistration)
}

/** The root scope of this origin, in the absolute form the Service Worker API reports. */
function rootScope(): string {
  return new URL('/', window.location.href).href
}

/**
 * Registers the push service worker served from `public/sw.js` at `/sw.js`.
 *
 * ALWAYS registers — it never short-circuits on an existing registration. That early return
 * was the reason a "fixed" notification kept showing the old artwork: the browser re-checks
 * /sw.js on its own throttled schedule (up to ~24 hours), so handing back the stored
 * registration left every device running the previous worker, old icon and all. Registering
 * asks for a fresh fetch; `update()` forces that check to happen now.
 *
 * The portal claims the root scope only when it is free or already ours: registering at `/`
 * on an origin whose scope another app's worker owns would silently replace that worker.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!supportsPush()) return null
  try {
    if (!(await findPushRegistration())) {
      const scope = rootScope()
      const taken = (await navigator.serviceWorker.getRegistrations().catch(() => [])).some(
        (registration) => registration.scope === scope,
      )
      if (taken) {
        console.warn('[push] step 1: another service worker owns the root scope; leaving it alone')
        return null
      }
    }

    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
    // `register()` alone can still be answered out of the browser's throttled check, and
    // `updateViaCache` defaults to 'imports', so /sw.js itself is re-fetched rather than cached.
    await registration.update().catch(() => undefined)
    console.info('[push] step 1: service worker registered and update requested at', registration.scope)
    return registration
  } catch (caught) {
    // A registration that never happens hides every later step, so the reason is kept
    // visible here instead of being swallowed — the caller only sees `null`.
    console.warn(
      '[push] step 1: service worker registration failed:',
      (caught as { name?: string })?.name ?? 'unknown',
      caught instanceof Error ? caught.message : caught,
    )
    return null
  }
}

/**
 * Waits until the service worker is ACTIVE.
 *
 * `pushManager.subscribe()` rejects with InvalidStateError while the worker is still
 * installing — which is what a first visit (and every iOS Safari session) looks like.
 * Returns null when the worker never activates, so the caller can explain that instead
 * of leaving the button spinning forever.
 */
export async function waitForActiveWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!supportsPush()) return null
  const timeout = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), ACTIVATION_TIMEOUT_MS)
  })
  return await Promise.race([navigator.serviceWorker.ready, timeout])
}

/** The `applicationServerKey` push managers expect: URL-safe base64 → bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

/**
 * True when an existing subscription was created with the VAPID key in use now.
 *
 * A subscription is bound to the key that created it, so after the keys are rotated the
 * old one still reports as subscribed while the push service rejects every send to it —
 * the device silently stops receiving notifications until it subscribes again. With no
 * usable key configured there is nothing to compare against, so this is false.
 */
export function subscriptionUsesCurrentKey(subscription: PushSubscription): boolean {
  if (VAPID_KEY_STATE !== 'configured') return false
  const used = subscription.options?.applicationServerKey
  if (!used) return false
  const expected = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  const actual = new Uint8Array(used)
  if (actual.length !== expected.length) return false
  return actual.every((byte, index) => byte === expected[index])
}
