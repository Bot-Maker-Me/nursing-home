'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  VAPID_PUBLIC_KEY,
  isIosBrowser,
  isStandaloneDisplay,
  registerServiceWorker,
  supportsPush,
  urlBase64ToUint8Array,
} from '@/lib/push'

export type PushStatus =
  | 'loading'
  | 'unsupported'
  | 'ios-install'
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

/**
 * The portal's push-notification state machine: not supported / blocked / enabled (with a
 * Disable option) plus iOS Safari's "install it first" case. Subscriptions are stored in
 * public.push_subscriptions (one row per device, endpoint-unique) via the portal API, and
 * removed again when the user disables notifications.
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
    const registration = await registerServiceWorker()
    if (!registration) {
      setStatus('unsupported')
      return
    }
    const subscription = await registration.pushManager.getSubscription().catch(() => null)
    setStatus(subscription ? 'on' : 'off')
  }, [])

  useEffect(() => {
    void detect()
  }, [detect])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      // Ask first, before any `await`: Safari only shows the prompt while the call is
      // still inside the user's click.
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setStatus('blocked')
        return
      }
      if (permission !== 'granted') {
        setStatus('off')
        return
      }

      const registration = await registerServiceWorker()
      if (!registration) {
        setStatus('unsupported')
        return
      }

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
        await subscription.unsubscribe()
        setStatus('off')
        setError('This device could not be registered for notifications. Please try again.')
        return
      }
      setStatus('on')
    } catch {
      setStatus('off')
      setError('Notifications could not be enabled on this device.')
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
    } catch {
      setError('Notifications could not be turned off on this device.')
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, busy, error, enable, disable }
}
