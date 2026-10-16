'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EMBED_HINT,
  VAPID_KEY_STATE,
  VAPID_PUBLIC_KEY,
  findPushRegistration,
  isEmbedded,
  isIosBrowser,
  isStandaloneDisplay,
  registerServiceWorker,
  subscriptionUsesCurrentKey,
  supportsPush,
  urlBase64ToUint8Array,
  vapidKeyMessage,
  waitForActiveWorker,
  type VapidKeyState,
} from '@/lib/push'

export type PushStatus =
  | 'loading'
  | 'not-configured'
  | 'misconfigured'
  | 'unsupported'
  | 'ios-install'
  | 'embedded'
  | 'off'
  | 'blocked'
  | 'on'

export type PushPermission = 'default' | 'granted' | 'denied' | 'unavailable'

/** What an administrator needs to see to tell a working setup from a broken one. */
export type PushDiagnostics = {
  keyState: VapidKeyState
  keyConfigured: boolean
  serviceWorkerRegistered: boolean
  permission: PushPermission
  /** `null` means nothing is subscribed on this device, or the check could not run. */
  subscriptionSaved: boolean | null
}

type PushApi = {
  status: PushStatus
  busy: boolean
  error: string | null
  diagnostics: PushDiagnostics
  enable: () => Promise<void>
  disable: () => Promise<void>
}

/**
 * Deterministic first render (permission is read after mount) so the server and client
 * markup agree — the diagnostic line never causes a hydration mismatch.
 */
const INITIAL_DIAGNOSTICS: PushDiagnostics = {
  keyState: VAPID_KEY_STATE,
  keyConfigured: VAPID_KEY_STATE === 'configured',
  serviceWorkerRegistered: false,
  permission: 'default',
  subscriptionSaved: null,
}

const VAPID_KEY_INVALID_FALLBACK =
  'This portal’s notification key could not be used, so no device can subscribe. Ask the pharmacy to check the NEXT_PUBLIC_VAPID_PUBLIC_KEY setting.'

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
      return VAPID_KEY_INVALID_FALLBACK
    default:
      // Naming the browser's own error keeps this diagnosable instead of a dead end.
      return `Notifications could not be enabled on this device (${name || 'no error name'}).`
  }
}

/** The status that matches the configured key, before any browser capability is probed. */
function keyStatus(): PushStatus | null {
  if (VAPID_KEY_STATE === 'missing') return 'not-configured'
  if (VAPID_KEY_STATE === 'invalid') return 'misconfigured'
  return null
}

/**
 * The portal's push-notification state machine: not configured (missing or invalid public
 * key) / not supported / blocked / enabled (with a Disable option), plus iOS Safari's
 * "install it first" and the embedded-page case. Subscriptions are stored in
 * public.push_subscriptions (one row per device, endpoint-unique) through the portal API,
 * and removed again when the user disables them.
 */
export function usePushNotifications(): PushApi {
  const [status, setStatus] = useState<PushStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics>(INITIAL_DIAGNOSTICS)

  /** Reads the live browser facts behind the admin diagnostic line. Never reads the key. */
  const refreshDiagnostics = useCallback(async () => {
    const permission: PushPermission =
      typeof Notification === 'undefined' ? 'unavailable' : Notification.permission

    let serviceWorkerRegistered = false
    let subscription: PushSubscription | null = null
    // Only the portal's own worker counts — another app's worker on this origin has no `push`
    // handler, so reporting its state would describe a device that can never be alerted.
    const registration = await findPushRegistration()
    if (registration) {
      serviceWorkerRegistered = true
      subscription = (await registration.pushManager.getSubscription().catch(() => null)) ?? null
    }

    // "Subscribed in this browser" and "the row is in push_subscriptions" are different
    // facts — the server is the only one that knows whether the save actually landed.
    let subscriptionSaved: boolean | null = null
    if (subscription?.endpoint) {
      const response = await fetch(`/api/portal/push?endpoint=${encodeURIComponent(subscription.endpoint)}`).catch(
        () => null,
      )
      const data = response?.ok ? ((await response.json().catch(() => null)) as { saved?: unknown } | null) : null
      if (typeof data?.saved === 'boolean') subscriptionSaved = data.saved
    }

    setDiagnostics({
      keyState: VAPID_KEY_STATE,
      keyConfigured: VAPID_KEY_STATE === 'configured',
      serviceWorkerRegistered,
      permission,
      subscriptionSaved,
    })
  }, [])

  const detect = useCallback(async () => {
    const blockedByKey = keyStatus()
    if (blockedByKey) {
      // Without a usable key no device can subscribe at all, so the key problem is reported
      // first and its own message (missing vs invalid) is rendered by the caller.
      setStatus(blockedByKey)
      setError(null)
      return
    }
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
    void refreshDiagnostics()
  }, [detect, refreshDiagnostics])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const blockedByKey = keyStatus()
      if (blockedByKey) {
        // Refuse before asking for permission: a subscription is impossible anyway, and the
        // permission prompt would still be spent.
        setStatus(blockedByKey)
        setError(vapidKeyMessage())
        return
      }
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
      if (!response.ok) {
        // The portal explains itself here (e.g. "…until the push migration is applied"),
        // which is far more useful than a generic failure. The save failing is logged too,
        // so a row that never landed is never a silent dead end.
        const data = (await response.json().catch(() => null)) as { error?: unknown } | null
        const message =
          typeof data?.error === 'string'
            ? data.error
            : 'This device could not be registered for notifications. Please try again.'
        console.error('[push] step 2: saving the subscription failed →', response.status, message)
        await subscription.unsubscribe()
        setStatus('off')
        setError(message)
        return
      }
      // Step 2: a 200 here is the proof that a row landed in push_subscriptions.
      console.info(
        '[push] step 2: subscription saved (POST /api/portal/push →',
        response.status,
        `, endpoint ${serialized.endpoint ? 'present' : 'MISSING'}, p256dh ${
          serialized.keys?.p256dh ? 'present' : 'MISSING'
        }, auth ${serialized.keys?.auth ? 'present' : 'MISSING'})`,
      )
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
      void refreshDiagnostics()
    }
  }, [refreshDiagnostics])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const registration = await findPushRegistration()
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
      void refreshDiagnostics()
    }
  }, [refreshDiagnostics])

  return { status, busy, error, diagnostics, enable, disable }
}
