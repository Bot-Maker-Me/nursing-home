'use client'

import { Bell, BellOff, Loader2 } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push'
import { IOS_PUSH_HINT } from '@/lib/push'

/**
 * "Enable notifications" control for Account settings. Covers every state the browser can
 * be in: unsupported, blocked, enabled (with a Disable option), and iOS Safari where the
 * portal has not been installed to the Home Screen yet.
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
        <StatusChip status={status} />

        {status === 'off' && (
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

      {status === 'blocked' && (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings, then reload this page.
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

function StatusChip({ status }: { status: ReturnType<typeof usePushNotifications>['status'] }) {
  const tone: Record<string, string> = {
    on: 'chip-brand inline-flex items-center px-2.5 py-1 text-xs font-semibold',
    off: 'chip-neutral inline-flex items-center px-2.5 py-1 text-xs font-semibold',
    blocked: 'chip-warn inline-flex items-center px-2.5 py-1 text-xs font-semibold',
    unsupported: 'chip-neutral inline-flex items-center px-2.5 py-1 text-xs font-semibold',
    'ios-install': 'chip-warn inline-flex items-center px-2.5 py-1 text-xs font-semibold',
    loading: 'chip-neutral inline-flex items-center px-2.5 py-1 text-xs font-semibold',
  }
  const label: Record<string, string> = {
    on: 'Enabled on this device',
    off: 'Off',
    blocked: 'Blocked in this browser',
    unsupported: 'Not supported in this browser',
    'ios-install': 'Install the portal first',
    loading: 'Checking…',
  }
  return <span className={tone[status]}>{label[status]}</span>
}
