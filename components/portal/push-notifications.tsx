'use client'

import { useState } from 'react'
import { Bell, BellOff, Loader2, Send } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push'
import { EMBED_HINT, IOS_PUSH_HINT, VAPID_KEY_STATE, vapidKeyMessage } from '@/lib/push'

type PushStatus = ReturnType<typeof usePushNotifications>['status']

const CHIP: Record<PushStatus, { className: string; label: string }> = {
  on: { className: 'chip-brand', label: 'Enabled on this device' },
  off: { className: 'chip-neutral', label: 'Off' },
  blocked: { className: 'chip-warn', label: 'Blocked in this browser' },
  unsupported: { className: 'chip-neutral', label: 'Not supported in this browser' },
  'ios-install': { className: 'chip-warn', label: 'Install the portal first' },
  embedded: { className: 'chip-warn', label: 'Open in its own tab' },
  'not-configured': { className: 'chip-warn', label: 'Not configured on this deployment' },
  misconfigured: { className: 'chip-warn', label: 'Notification key is not valid' },
  loading: { className: 'chip-neutral', label: 'Checking…' },
}

/**
 * "Enable notifications" control for Account settings. Covers every state the browser can
 * be in: unsupported, blocked, enabled (with a Disable option), iOS Safari before the
 * portal is installed to the Home Screen, and a page that is embedded in another one.
 *
 * When this deployment has no usable VAPID public key there is nothing a user can do, so
 * the control says whether the key is missing or invalid instead of offering a button that
 * cannot work. Administrators additionally get a one-line diagnostic of the whole chain.
 *
 * Once a device is enabled it also offers a test alert: a real push only happens when the
 * pharmacy replies, so without this there is no way to tell a working device from a broken
 * one until it matters.
 */
export function PushNotificationSettings({ isAdmin = false }: { isAdmin?: boolean }) {
  const { status, busy, error, diagnostics, enable, disable } = usePushNotifications()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const sendTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const response = await fetch('/api/portal/push/test', { method: 'POST' })
      const data = (await response.json().catch(() => null)) as { error?: unknown; sent?: unknown } | null
      if (!response.ok) {
        setTestResult({
          ok: false,
          message:
            typeof data?.error === 'string' ? data.error : 'The test alert could not be sent. Please try again.',
        })
        return
      }
      setTestResult({
        ok: true,
        message: `Test alert sent to ${typeof data?.sent === 'number' ? data.sent : 1} device. Close this tab — it should still appear.`,
      })
    } catch {
      setTestResult({ ok: false, message: 'The test alert could not be sent. Check your connection and try again.' })
    } finally {
      setTesting(false)
    }
  }

  const configurationMessage = vapidKeyMessage(VAPID_KEY_STATE)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Get a browser alert the moment the pharmacy replies, even when the portal is closed. Alerts are generic by
        design — they never include message content, resident details or medication names.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold ${CHIP[status].className}`}>
          {CHIP[status].label}
        </span>

        {(status === 'off' || status === 'embedded') && (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 bg-forest px-4 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Bell className="size-4" aria-hidden="true" />}
            Enable notifications
          </button>
        )}

        {status === 'on' && (
          <>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={testing}
              className="inline-flex h-10 items-center gap-2 bg-forest px-4 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50"
            >
              {testing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              Send a test alert
            </button>
            <button
              type="button"
              onClick={() => void disable()}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 border border-hairline px-4 text-sm font-semibold text-forest hover:bg-mint disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
              Disable
            </button>
          </>
        )}
      </div>

      {testResult && (
        <p role={testResult.ok ? 'status' : 'alert'} className={`text-sm ${testResult.ok ? 'text-forest' : 'text-terracotta'}`}>
          {testResult.message}
        </p>
      )}

      {configurationMessage && <p role="alert" className="text-sm text-muted-foreground">{configurationMessage}</p>}

      {status === 'ios-install' && <p className="text-sm text-forest">{IOS_PUSH_HINT}</p>}

      {status === 'embedded' && <p className="text-sm text-forest">{EMBED_HINT}</p>}

      {status === 'blocked' && (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings, then reload this page.
        </p>
      )}

      {status === 'unsupported' && (
        <p className="text-sm text-muted-foreground">
          This browser cannot show notifications. On iPhone and iPad, notifications work after adding the portal to your
          Home Screen.
        </p>
      )}

      {status === 'loading' && <p className="text-sm text-muted-foreground">Checking notification settings…</p>}

      {error && (
        <p role="alert" className="whitespace-pre-line text-sm text-terracotta">
          {error}
        </p>
      )}

      {isAdmin && (
        <p className="border-t border-hairline pt-3 text-xs text-muted-foreground">
          <span className="eyebrow mr-2">Push diagnostic</span>
          Key configured: {diagnostics.keyConfigured ? 'yes' : `no (${diagnostics.keyState})`} &middot; Service worker
          registered: {diagnostics.serviceWorkerRegistered ? 'yes' : 'no'} &middot; Permission: {diagnostics.permission}{' '}
          &middot; Subscription saved: {diagnostics.subscriptionSaved === null ? 'unknown' : diagnostics.subscriptionSaved ? 'yes' : 'no'}
        </p>
      )}
    </div>
  )
}
