'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Thread = { id: string; subject: string; preview: string; unread: number; urgent: boolean }

/**
 * Live notification bell for the home (nursing home) portal. Counts unread pharmacy
 * replies and lists the conversations that need attention. Designed to work on both
 * the desktop sidebar and the mobile menu.
 */
export function NotificationBell() {
  const supabase = useMemo(() => createClient(), [])
  const [threads, setThreads] = useState<Thread[]>([])
  const [open, setOpen] = useState(false)
  // The Supabase browser client is a singleton and the bell renders twice (desktop +
  // mobile). Each instance needs its own channel topic, otherwise the second instance
  // reuses the already-subscribed channel and `.on()` throws.
  const channelName = useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    let active = true
    const load = async () => {
      const response = await fetch('/api/portal/threads')
      if (!active || !response.ok) return
      const data = (await response.json()) as Thread[]
      setThreads(data.filter((thread) => thread.unread > 0 || thread.urgent))
    }
    void load()
    const channel = supabase
      .channel(`portal-notifications-${channelName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_messages' }, () => void load())
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [supabase, channelName])

  const total = threads.reduce((sum, thread) => sum + thread.unread, 0)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Notifications${total > 0 ? `, ${total} unread` : ''}`}
        className="relative grid size-10 place-items-center text-sidebar-foreground/70 hover:text-white"
      >
        <Bell className="size-4" aria-hidden="true" />
        {total > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-badge bg-[var(--badge-bg)] px-1 font-mono text-[10px] font-bold text-[var(--badge-ink)]">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="rounded-card absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] border border-hairline bg-paper text-foreground shadow-lg">
            <p className="border-b border-hairline px-4 py-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Notifications
            </p>
            {threads.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">You’re all caught up.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-hairline overflow-y-auto">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <Link
                      href="/portal/messages"
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-cream"
                    >
                      <MessageSquare className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{thread.subject}</span>
                          {thread.urgent && (
                            <span className="rounded-badge bg-terracotta px-1.5 text-[10px] font-bold uppercase text-white">Urgent</span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {thread.preview || 'New message'}
                        </span>
                      </span>
                      {thread.unread > 0 && (
                        <span className="rounded-badge bg-mint px-1.5 font-mono text-[11px] text-forest">{thread.unread}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/portal/messages"
              onClick={() => setOpen(false)}
              className="block border-t border-hairline px-4 py-3 text-center text-xs font-semibold text-forest hover:bg-cream"
            >
              Open Connect with Pharmacy
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
