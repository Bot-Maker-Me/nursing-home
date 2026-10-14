'use client'

import { useEffect, useState } from 'react'
import { Bell, Loader2, X } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push'
import { IOS_PUSH_HINT } from '@/lib/push'

const DISMISS_KEY = 'portal-push-banner-dismissed'

/**
 * Dismissible "turn on notifications" banner above the chat. It only appears while there
 * is something the user can act on (not enabled, or iOS waiting for Home Screen install),
 * and stays dismissed once they hide it.
 */
export function PushBanner() {
  const { status, busy, error, enable } = usePushNotifications()
  // Hidden until localStorage has been read, so the banner never flashes on first paint.
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (dismissed || (status !== 'off' && status !== 'ios-install')) return null

  return (
    <div className="mb-4 flex flex-wrap items-start gap-3 border border-hairline bg-mint p-4">
      <Bell className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-forest">Turn on message alerts</p>
        <p className="mt-1 text-xs text-foreground/80">
          {status === 'ios-install'
            ? IOS_PUSH_HINT
            : 'Get a browser alert when the pharmacy replies — even when this tab is closed. Alerts never include message content or resident details.'}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-terracotta">
            {error}
          </p>
        )}
      </div>
      {status === 'off' && (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-2 bg-forest px-3 text-xs font-semibold text-cream hover:bg-forest-deep disabled:opacity-50"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          Enable notifications
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notification prompt"
        className="shrink-0 text-forest hover:opacity-70"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
