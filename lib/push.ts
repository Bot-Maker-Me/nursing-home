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

/** Shown on iOS Safari, where push only works from an installed Home Screen app. */
export const IOS_PUSH_HINT =
  'Tap Share, then Add to Home Screen, then open from the Home Screen to enable notifications.'

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

/** The `applicationServerKey` push managers expect: URL-safe base64 → bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}
