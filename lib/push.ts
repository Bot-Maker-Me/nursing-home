/**
 * Web Push client helpers.
 *
 * The VAPID PUBLIC key is public by design — the browser sends it to the push service
 * with every subscribe request, so it is safe to ship in the JavaScript bundle (exactly
 * like the Supabase anon key in lib/supabase/env.ts).
 *
 * The matching VAPID PRIVATE key must NEVER appear here, in any NEXT_PUBLIC_* variable,
 * or in any client bundle. It lives only in the `send-push` Edge Function secrets.
 */

const DEFAULT_VAPID_PUBLIC_KEY =
  'BDaCCchx_dz_t_BhGHyYhUxBJn3HRlgzNp8A1odmLS65lq_MdPP0dGfqVZ_lgwzDGIayOgmUIvxz-de04OFk2VNU'

export const VAPID_PUBLIC_KEY =
  (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim() || DEFAULT_VAPID_PUBLIC_KEY

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

/**
 * Registers (or finds) the push service worker. Safe to call on every app load: the
 * browser returns the existing registration instead of installing a second one.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!supportsPush()) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration()
    if (existing) return existing
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
  } catch {
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
