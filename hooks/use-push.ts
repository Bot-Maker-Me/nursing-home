'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EMBED_HINT,
  VAPID_PUBLIC_KEY,
  isEmbedded,
  isIosBrowser,
  isStandaloneDisplay,
  registerServiceWorker,
  subscriptionUsesCurrentKey,
  supportsPush,
  urlBase64ToUint8Array,
  waitForActiveWorker,
} from '@/lib/push'

export type PushStatus =
  | 'loading'
  | 'unsupported'
  | 'ios-install'
  | 'embedded'
  | 'off'
  | 'blocked'
  | 'on'

type PushApi = {
  status: PushStatus
  busy: boolean
  error: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
}

/** Turns a thrown browser error into something a nurse can act on. */
function describePushError(error: unknown): string {
  if (isEmbedded()) return EMBED_HINT
  const name = (error as { name?: string })?.name ?? ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Your browser refused the notification permission. Allow notifications for this site in your browser settings, then reload this page.'
    case 'InvalidStateError':
      return 'The notification service was still starting up. Reload the page and try again.'
    case 'AbortError':
      return 'Your browser could not reach its push service. Check your connection and try again.'
    case 'NotSupportedError':
      return 'This browser could not create a push subscription for this portal.'
    case 'TypeError':
      return 'Notifications cannot be enabled in this context — open the portal in its own tab.'
    case 'InvalidCharacterError':
    case 'DataError':
      return 'This portal’s notification key is not valid, so no device can subscribe. Ask the pharmacy to check the push configuration.'
    default:
      // Naming the browser's own error keeps this diagnosable instead of a dead end.
      return `Notifications could not be enabled on this device (${name || 'no error name'}).`
  }
}

/**
 * The portal's push-notification state machine: not supported / blocked / enabled (with a
 * Disable option), plus iOS Safari's "install it first" and the embedded-page case.
 * Subscriptions are stored in public.push_subscriptions (one row per device,
 * endpoint-unique) through the portal API, and removed again when the user disables them.
 */
export function usePushNotifications(): PushApi {
  const [status, setStatus] = useState<PushStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detect = useCallback(async () => {
    if (!supportsPush()) {
      // iOS Safari only exposes the Push API to an app opened from the Home Screen, so an
      // iPhone in a plain tab is told how to install the portal rather than "unsupported".
      setStatus(isIosBrowser() ? 'ios-install' : 'unsupported')
      return
    }
    if (isIosBrowser() && !isStandaloneDisplay()) {
      setStatus('ios-install')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('blocked')
      return
    }
    // An embedded page can never show the permission prompt. If permission was granted
    // on this origin already we carry on — the subscription itself still works.
    if (isEmbedded() && Notification.permission !== 'granted') {
      setStatus('embedded')
      return
    }
    const registration = await registerServiceWorker()
    if (!registration) {
      setStatus('unsupported')
      return
    }
    const subscription = await registration.pushManager.getSubscription().catch(() => null)
    // A subscription made with a previous key reports as enabled but can never receive a
    // push, so it counts as "off" and the button offers to set the device up again.
    setStatus(subscription && subscriptionUsesCurrentKey(subscription) ? 'on' : 'off')
  }, [])

  useEffect(() => {
    void detect()
  }, [detect])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (typeof Notification.requestPermission !== 'function') {
        setStatus('unsupported')
        return
      }

      // Ask first, before any `await`: Safari only shows the prompt while the call is
      // still inside the user's click.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        if (isEmbedded()) {
          setStatus('embedded')
          setError(EMBED_HINT)
        } else if (permission === 'denied') {
          setStatus('blocked')
        } else {
          setStatus('off')
        }
        return
      }

      if (!(await registerServiceWorker())) {
        setError('The notification service could not start. Reload the page and try again.')
        return
      }

      // pushManager.subscribe() needs an ACTIVE worker; on a first visit — and always on
      // iOS — the registration is still installing, which throws InvalidStateError.
      const registration = await waitForActiveWorker()
      if (!registration) {
        setError('The notification service did not start in time. Reload the page and try again.')
        return
      }

      // Drop a subscription left over from an earlier key before subscribing afresh —
      // the push service refuses sends signed with a key the subscription was not made
      // with, so keeping it would leave this device silently unnotified.
      const stale = await registration.pushManager.getSubscription().catch(() => null)
      if (stale && !subscriptionUsesCurrentKey(stale)) {
        await stale.unsubscribe().catch(() => undefined)
      }

      // Step 3: this key must be byte-for-byte the same as the Edge Function's
      // VAPID_PUBLIC_KEY secret, otherwise the subscription is created against one key
      // while every send is signed with the other, and the push service answers 403.
      console.info('[push] step 3: subscribing with VAPID public key of length', VAPID_PUBLIC_KEY.length)

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }))

      const serialized = subscription.toJSON() as {
        endpoint?: string
        keys?: { p256dh?: string; auth?: string }
      }
      const response = await fetch('/api/portal/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: serialized.endpoint,
          p256dh: serialized.keys?.p256dh,
          auth: serialized.keys?.auth,
          userAgent: navigator.userAgent,
        }),
      })
      // Step 2: a 200 here is the proof that a row landed in push_subscriptions.
      console.info(
        '[push] step 2: POST /api/portal/push →',
        response.status,
        `(endpoint ${serialized.endpoint ? 'present' : 'MISSING'}, p256dh ${
          serialized.keys?.p256dh ? 'present' : 'MISSING'
        }, auth ${serialized.keys?.auth ? 'present' : 'MISSING'})`,
      )
      if (!response.ok) {
        // The portal explains itself here (e.g. "…until the push migration is applied"),
        // which is far more useful than a generic failure.
        const data = (await response.json().catch(() => null)) as { error?: unknown } | null
        await subscription.unsubscribe()
        setStatus('off')
        setError(
          typeof data?.error === 'string'
            ? data.error
            : 'This device could not be registered for notifications. Please try again.',
        )
        return
      }
      setStatus('on')
    } catch (caught) {
      // Keep the reason visible in the console; the user gets the readable version.
      console.warn(
        '[push] enable failed:',
        (caught as { name?: string })?.name ?? 'unknown',
        caught instanceof Error ? caught.message : caught,
      )
      setError(describePushError(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/portal/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined)
        await subscription.unsubscribe()
      }
      setStatus('off')
    } catch (caught) {
      console.warn('[push] disable failed:', (caught as { name?: string })?.name ?? 'unknown')
      setError('Notifications could not be turned off on this device.')
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, busy, error, enable, disable }
}
