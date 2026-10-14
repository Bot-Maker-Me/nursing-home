'use client'

import { Bell, BellOff, Loader2 } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push'
import { EMBED_HINT, IOS_PUSH_HINT } from '@/lib/push'

type PushStatus = ReturnType<typeof usePushNotifications>['status']

const CHIP: Record<PushStatus, { className: string; label: string }> = {
  on: { className: 'chip-brand', label: 'Enabled on this device' },
  off: { className: 'chip-neutral', label: 'Off' },
  blocked: { className: 'chip-warn', label: 'Blocked in this browser' },
  unsupported: { className: 'chip-neutral', label: 'Not supported in this browser' },
  'ios-install': { className: 'chip-warn', label: 'Install the portal first' },
  embedded: { className: 'chip-warn', label: 'Open in its own tab' },
  loading: { className: 'chip-neutral', label: 'Checking…' },
}

/**
 * "Enable notifications" control for Account settings. Covers every state the browser can
 * be in: unsupported, blocked, enabled (with a Disable option), iOS Safari before the
 * portal is installed to the Home Screen, and a page that is embedded in another one.
 */
export function PushNotificationSettings() {
  const { status, busy, error, enable, disable } = usePushNotifications()

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
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 border border-hairline px-4 text-sm font-semibold text-forest hover:bg-mint disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
            Disable
          </button>
        )}
      </div>

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
        <p role="alert" className="text-sm text-terracotta">
          {error}
        </p>
      )}
    </div>
  )
}
