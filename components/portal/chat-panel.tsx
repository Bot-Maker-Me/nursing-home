'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, Loader2, Mail, Plus, RotateCcw, Send, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/common/toast'
import { PushBanner } from '@/components/portal/push-banner'

type Thread = {
  id: string
  subject: string
  resident_ref: string
  urgent: boolean
  last_message_at: string
  archived_at?: string | null
  preview: string
  unread: number
}

type Message = {
  id: string
  sender_role: string
  sender_name: string
  body: string
  urgent: boolean
  read_at: string | null
  created_at: string
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const dayKey = (iso: string) => new Date(iso).toDateString()
const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })

/** "Yesterday · Mon, 12 Oct 2026" for the last two days, otherwise just the date. */
const dayLabel = (iso: string) => {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const key = dayKey(iso)
  if (key === dayKey(today.toISOString())) return `Today · ${stamp(iso)}`
  if (key === dayKey(yesterday.toISOString())) return `Yesterday · ${stamp(iso)}`
  return stamp(iso)
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function MessageRow({ message }: { message: Message }) {
  const mine = message.sender_role === 'home'
  return (
    <li className={cn('flex items-end gap-3', mine && 'flex-row-reverse')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold',
          mine ? 'bg-brand text-cream' : 'bg-brand-tint text-brand',
        )}
      >
        {initials(message.sender_name)}
      </span>
      <div className="min-w-0 max-w-[85%] sm:max-w-md">
        <p className={cn('mb-1 truncate text-xs font-semibold', mine && 'text-right')}>{message.sender_name}</p>
        <div className={cn('rounded-2xl px-4 py-3', mine ? 'bg-brand text-cream' : 'border border-hairline bg-paper')}>
          {message.urgent && (
            <span
              className={cn(
                'rounded-badge mb-2 inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase',
                mine ? 'bg-cream/20 text-cream' : 'bg-brand-tint text-brand',
              )}
            >
              <AlertTriangle className="size-3" aria-hidden="true" />
              Urgent
            </span>
          )}
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
          <p
            className={cn(
              'mt-1.5 flex items-center gap-2 font-mono text-[11px]',
              mine ? 'text-cream/70' : 'text-muted-foreground',
            )}
          >
            {clock(message.created_at)}
            <span>{message.read_at ? 'Read' : mine ? 'Sent' : 'Delivered'}</span>
          </p>
        </div>
      </div>
    </li>
  )
}

export function ChatPanel({ homeName }: { homeName: string }) {
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [draft, setDraft] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [sending, setSending] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newResident, setNewResident] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [busyId, setBusyId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLLIElement>(null)
  const channelName = useId().replace(/[^a-zA-Z0-9]/g, '')

  const visibleThreads = threads.filter((thread) =>
    view === 'archived' ? Boolean(thread.archived_at) : !thread.archived_at,
  )
  const archivedCount = threads.filter((thread) => Boolean(thread.archived_at)).length
  const activeThread = visibleThreads.find((thread) => thread.id === activeId) ?? null

  // Date separators, WhatsApp-style: one divider per calendar day.
  const rows: Array<{ kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: Message }> = []
  let lastDay = ''
  for (const message of messages) {
    const key = dayKey(message.created_at)
    if (key !== lastDay) {
      rows.push({ kind: 'day', key: `day-${key}`, label: dayLabel(message.created_at) })
      lastDay = key
    }
    rows.push({ kind: 'message', key: message.id, message })
  }

  const loadThreads = useCallback(async () => {
    const response = await fetch('/api/portal/threads')
    if (!response.ok) {
      setLoadingThreads(false)
      return []
    }
    const data: Thread[] = await response.json()
    setThreads(data)
    setLoadingThreads(false)
    return data
  }, [])

  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true)
    const response = await fetch(`/api/portal/threads/${threadId}/messages`)
    if (response.ok) setMessages(await response.json())
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    void loadThreads().then((data) => {
      if (data.length > 0) setActiveId((current) => current ?? data[0].id)
    })
  }, [loadThreads])

  useEffect(() => {
    if (!activeId) return
    void loadMessages(activeId)
    void fetch(`/api/portal/threads/${activeId}/messages`, { method: 'PATCH' })
  }, [activeId, loadMessages])

  // Keep the open conversation inside the current tab when switching views.
  useEffect(() => {
    if (visibleThreads.length > 0 && !visibleThreads.some((thread) => thread.id === activeId)) {
      setActiveId(visibleThreads[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, threads, activeId])

  useEffect(() => {
    const channel = supabase
      .channel(`portal-chat-${channelName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_messages' }, () => {
        void loadThreads()
        if (activeId) void loadMessages(activeId)
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, activeId, loadMessages, loadThreads, channelName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!activeId || !text) return
    setSending(true)
    const response = await fetch(`/api/portal/threads/${activeId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, urgent }),
    })
    if (!response.ok) {
      toast.error('Message could not be sent.')
      setSending(false)
      return
    }
    const item: Message = await response.json()
    setMessages((current) => [...current, item])
    setDraft('')
    setUrgent(false)
    setSending(false)
    void loadThreads()
  }

  const createThread = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newSubject.trim()) {
      toast.error('Give the conversation a short subject.')
      return
    }
    setCreating(true)
    const response = await fetch('/api/portal/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: newSubject, residentRef: newResident, message: newMessage, urgent }),
    })
    if (!response.ok) {
      toast.error('Conversation could not be started.')
      setCreating(false)
      return
    }
    const thread: Thread = await response.json()
    setThreads((current) => [{ ...thread, preview: newMessage, unread: 0 }, ...current])
    setView('active')
    setActiveId(thread.id)
    setNewSubject('')
    setNewResident('')
    setNewMessage('')
    setUrgent(false)
    setShowNew(false)
    setCreating(false)
    toast.success('Conversation started with the pharmacy.')
  }

  const sendEmail = async () => {
    const text = draft.trim()
    if (!text) {
      toast.error('Write a message before emailing the pharmacy.')
      return
    }
    const response = await fetch('/api/portal/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: activeThread?.subject ?? 'Portal message', message: text }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? 'Email could not be sent.')
      return
    }
    if (data?.configured) {
      toast.success('Email sent to the pharmacy.')
      return
    }
    toast.success('Opening your email app to send this message.')
    window.location.href = `mailto:${data.to}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`
  }

  const toggleArchive = async (thread: Thread) => {
    const archived = !thread.archived_at
    setBusyId(thread.id)
    const response = await fetch('/api/portal/threads', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, archived }),
    })
    setBusyId(null)
    if (!response.ok) {
      toast.error(archived ? 'Conversation could not be archived.' : 'Conversation could not be restored.')
      return
    }
    toast.success(archived ? 'Conversation archived.' : 'Conversation restored to the inbox.')
    await loadThreads()
  }

  return (
    <>
      <PushBanner />
      <div className="mt-8 grid grid-cols-1 border border-hairline bg-paper lg:h-[min(78svh,46rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col border-b border-hairline lg:min-h-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 border-b border-hairline p-4">
          <div>
            <p className="eyebrow text-forest-soft/80">Conversations</p>
            <p className="mt-1 text-xs text-muted-foreground">{homeName}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew((value) => !value)}
            className="inline-flex h-9 items-center gap-1.5 border border-hairline px-3 text-xs font-semibold text-forest hover:bg-mint"
          >
            {showNew ? <X className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
            {showNew ? 'Cancel' : 'New'}
          </button>
        </div>

        <div className="flex gap-1 border-b border-hairline bg-cream p-2">
          {(['active', 'archived'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={cn(
                'flex-1 rounded-field px-3 py-1.5 text-xs font-semibold capitalize',
                view === option ? 'bg-paper text-forest' : 'text-muted-foreground hover:text-forest',
              )}
            >
              {option}
              {option === 'archived' && archivedCount > 0 ? ` (${archivedCount})` : ''}
            </button>
          ))}
        </div>

        {showNew && (
          <form onSubmit={createThread} className="space-y-3 border-b border-hairline bg-cream p-4">
            <div>
              <label htmlFor="new-subject" className="mb-1 block text-xs font-medium">Subject</label>
              <input
                id="new-subject"
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
                placeholder="Medication supply"
                className="h-10 w-full border border-hairline bg-paper px-3 text-sm focus:border-forest"
              />
            </div>
            <div>
              <label htmlFor="new-resident" className="mb-1 block text-xs font-medium">Resident ID or initials</label>
              <input
                id="new-resident"
                value={newResident}
                onChange={(event) => setNewResident(event.target.value)}
                placeholder="e.g. 2B-014"
                className="h-10 w-full border border-hairline bg-paper px-3 font-mono text-sm focus:border-forest"
              />
            </div>
            <div>
              <label htmlFor="new-message" className="mb-1 block text-xs font-medium">First message</label>
              <textarea
                id="new-message"
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                rows={3}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:border-forest"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 bg-forest text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50"
            >
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              Start conversation
            </button>
          </form>
        )}

        <ul className="max-h-72 divide-y divide-hairline overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1" aria-label="Threads">
          {loadingThreads && <li className="p-4 text-sm text-muted-foreground">Loading conversations…</li>}
          {!loadingThreads && visibleThreads.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              {view === 'archived' ? 'No archived conversations.' : 'No conversations yet. Start one with the pharmacy.'}
            </li>
          )}
          {visibleThreads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => setActiveId(thread.id)}
                aria-current={thread.id === activeId ? 'true' : undefined}
                className={cn('w-full p-4 text-left', thread.id === activeId ? 'bg-cream' : 'hover:bg-cream/50')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{thread.subject}</span>
                  {thread.urgent && (
                    <span className="rounded-badge inline-flex items-center gap-1 bg-terracotta px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      Urgent
                    </span>
                  )}
                  {!thread.urgent && thread.unread > 0 && (
                    <span className="rounded-badge bg-terracotta px-1.5 py-0.5 font-mono text-[11px] text-white">{thread.unread}</span>
                  )}
                </div>
                {thread.resident_ref && <p className="mt-1 font-mono text-xs text-forest-soft">{thread.resident_ref}</p>}
                <p className="mt-1 truncate text-xs text-muted-foreground">{thread.preview || 'No messages yet'}</p>
                {thread.archived_at && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Archive className="size-3" aria-hidden="true" />
                    Archived {stamp(thread.archived_at)}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex h-[32rem] min-w-0 flex-col lg:h-auto lg:min-h-0">
        {activeThread ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight">{activeThread.subject}</h2>
                  {activeThread.resident_ref && (
                    <span className="rounded-badge bg-brand-tint px-2 py-0.5 font-mono text-[11px] text-brand">
                      {activeThread.resident_ref}
                    </span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  Secure channel · shared with {homeName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeThread.urgent && (
                  <span className="rounded-badge bg-terracotta px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-white uppercase">
                    Urgent
                  </span>
                )}
                {activeThread.archived_at && (
                  <span className="rounded-badge inline-flex items-center gap-1.5 border border-hairline bg-cream px-2.5 py-1 text-xs text-muted-foreground">
                    <Archive className="size-3.5" aria-hidden="true" />
                    Archived
                  </span>
                )}
                <span className="rounded-badge inline-flex items-center gap-1.5 bg-brand-tint px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-brand uppercase">
                  <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
                  Live
                </span>
                <button
                  type="button"
                  onClick={() => void toggleArchive(activeThread)}
                  disabled={busyId === activeThread.id}
                  className="rounded-field inline-flex h-9 items-center gap-1.5 border border-hairline px-3 text-xs font-semibold text-forest hover:bg-mint disabled:opacity-50"
                >
                  {busyId === activeThread.id ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : activeThread.archived_at ? (
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Archive className="size-3.5" aria-hidden="true" />
                  )}
                  {activeThread.archived_at ? 'Restore' : 'Archive'}
                </button>
              </div>
            </div>

            <ol className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-6">
              {loadingMessages && <li className="text-sm text-muted-foreground">Loading messages…</li>}
              {!loadingMessages && messages.length === 0 && (
                <li className="text-sm text-muted-foreground">No messages in this conversation yet.</li>
              )}
              {rows.map((row) =>
                row.kind === 'day' ? (
                  <li key={row.key} className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
                    <span className="eyebrow text-muted-foreground">{row.label}</span>
                    <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
                  </li>
                ) : (
                  <MessageRow key={row.key} message={row.message} />
                ),
              )}
              <li ref={bottomRef} aria-hidden="true" />
            </ol>

            <form onSubmit={send} className="border-t border-hairline p-4">
              <label htmlFor="msg" className="sr-only">Message</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUrgent((value) => !value)}
                  aria-pressed={urgent}
                  className={cn(
                    'grid size-12 place-items-center rounded-field border',
                    urgent ? 'border-terracotta bg-terracotta text-white' : 'border-hairline text-muted-foreground hover:bg-cream',
                  )}
                  aria-label="Flag as urgent"
                  title="Flag as urgent"
                >
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </button>
                <input
                  id="msg"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write to the pharmacy…"
                  className="h-12 min-w-0 flex-1 border border-hairline bg-cream px-4 text-sm focus:border-forest"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="inline-flex h-12 items-center gap-2 bg-forest px-5 text-sm font-semibold text-cream disabled:opacity-50"
                >
                  {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  Send
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  Live · updates appear instantly
                  {urgent && <span className="font-semibold text-terracotta">· Urgent flag on</span>}
                </span>
                <button type="button" onClick={sendEmail} className="inline-flex items-center gap-1.5 font-semibold text-forest underline">
                  <Mail className="size-3.5" aria-hidden="true" />
                  Email the pharmacy
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">
            Select a conversation or start a new one to message the pharmacy.
          </div>
        )}
      </div>
      </div>
    </>
  )
}
