/*
 * Service worker for the Henderson's Pharmacy client portal.
 *
 * Scope: push notifications only. Nothing is cached or intercepted, so the portal keeps
 * behaving exactly as before — this worker exists because push subscriptions are
 * per-origin, so every origin needs its own copy of this file.
 *
 * PRIVACY GUARD — this is a healthcare setting, so a lock screen may never carry message
 * content, resident names or medication names. Only the approved generic strings below are
 * ever shown: 'New message' with a body that starts with 'You have a new message', or the
 * copy for the portal's own test alert. ANY other title or body is discarded, even if the
 * sender asks for it.
 */

/*
 * Brand artwork, generated in code by this app rather than shipped as an image file — see
 * app/apple-icon.tsx and app/notification-badge/route.tsx. Both are the portal's own mark
 * (a forest-green square with the cream plus), matching app/icon.svg and the sidebar logo.
 *
 * Never point these back at a file in `public/`: that is where the starter template's
 * artwork lived, and a vendor logo on a notification is exactly the bug this fixes. Note the
 * missing extension — the generated image is served at `/apple-icon`, not `/apple-icon.png`.
 */
const ICON = '/apple-icon'
const BADGE = '/notification-badge'
/** `/chat` is the shared chat path used by send-push; this origin serves its chat here. */
const DEFAULT_URL = '/portal/messages'

const SAFE_TITLE = 'New message'
const SAFE_BODY = 'You have a new message'
const TITLE_PATTERN = /^(New message|Message alerts are on)$/
const BODY_PATTERN = /^(You have a new message( from [^<>]{1,60})?|Test alert from your pharmacy portal)$/

/** Discards anything that is not exactly one of the approved, generic strings. */
function safeText(value, fallback, pattern) {
  if (typeof value !== 'string') return fallback
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text || text.length > 120 || !pattern.test(text)) return fallback
  return text
}

/** Only a same-origin relative path is honoured; '/chat' resolves to this portal's chat. */
function targetPath(data) {
  const url = data && typeof data.url === 'string' ? data.url : ''
  if (!url.startsWith('/') || url.startsWith('//')) return DEFAULT_URL
  if (url === '/chat' || url.startsWith('/chat?') || url.startsWith('/chat/')) return DEFAULT_URL
  return url
}

/**
 * The artwork for a notification: the sender's own path when it supplies one, else the
 * portal's mark.
 *
 * A path only, never an absolute URL. Honouring a full URL would let a payload make each
 * device fetch an image from a third-party host, which both leaks the alert (a beacon) and
 * lets a sender dress itself up as someone else. A same-origin path is served by this app,
 * so the sender's brand can only ever be artwork this origin actually ships. The badge is
 * never taken from the payload: Android masks it to a silhouette, so it stays our own glyph.
 */
function iconPath(value, fallback) {
  if (typeof value !== 'string') return fallback
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 200) return fallback
  return path
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  // Step 6: if this line never appears, the push never reached the browser — the fault is
  // upstream (the database trigger or the Edge Function).
  console.info('[sw] step 6: push received')
  // Always show something: iOS penalises pushes that display no notification, and the
  // defaults below are the approved generic strings, so nothing private can leak.
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Anything that is not JSON cannot be an approved notification — defaults are safe.
    payload = {}
  }

  const title = safeText(payload?.title, SAFE_TITLE, TITLE_PATTERN)
  const body = safeText(payload?.body, SAFE_BODY, BODY_PATTERN)

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: iconPath(payload?.icon, ICON),
        badge: BADGE,
        tag: 'portal-chat',
        renotify: true,
        data: { url: targetPath(payload?.data) },
      })
      .then(() => console.info('[sw] step 6: notification displayed —', title)),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(targetPath(event.notification.data), self.location.origin).href

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windowClients.find((client) => new URL(client.url).origin === self.location.origin)

      if (existing) {
        await existing.focus()
        if (typeof existing.navigate === 'function' && existing.url !== target) {
          await existing.navigate(target).catch(() => undefined)
        }
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})
