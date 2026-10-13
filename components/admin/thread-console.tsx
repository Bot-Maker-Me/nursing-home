'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, Archive, Loader2, Plus, RotateCcw, Send, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/common/toast'

type Thread = {
  id: string
  subject: string
  resident_ref: string
  urgent: boolean
  created_by: string
  home_id?: string | null
  last_message_at: string
  archived_at?: string | null
  homeName?: string
  member: { name: string; home: string } | null
}
type Message = {
  id: string
  thread_id: string
  sender_role: string
  sender_name: string
  body: string
  urgent: boolean
  read_at: string | null
  created_at: string
}
type Home = { id: string; name: string; city?: string }

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

const homeLabel = (thread: Thread) => thread.homeName || thread.member?.home || 'Unassigned home'

function MessageRow({ message }: { message: Message }) {
  const mine = message.sender_role === 'pharmacy'
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
            <span>{message.read_at ? 'Read' : mine ? 'Sent' : 'Unread'}</span>
          </p>
        </div>
      </div>
    </li>
  )
}

export function ThreadConsole({
  endpoint = '/api/admin/threads',
  allowNew = false,
  homeFilter = false,
}: {
  endpoint?: string
  allowNew?: boolean
  homeFilter?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [homes, setHomes] = useState<Home[]>([])
  const [filterHomeId, setFilterHomeId] = useState('')
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newHomeId, setNewHomeId] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newResident, setNewResident] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const channelName = useId().replace(/[^a-zA-Z0-9]/g, '')

  const load = async () => {
    const response = await fetch(endpoint)
    if (!response.ok) {
      setLoading(false)
      return
    }
    const data: { threads: Thread[]; messages: Message[]; homes?: Home[] } = await response.json()
    setThreads(data.threads ?? [])
    setMessages(data.messages ?? [])
    if (data.homes) {
      setHomes(data.homes)
      if (homeFilter) setFilterHomeId((current) => current || data.homes?.[0]?.id || '')
    }
    setActiveId((current) => current ?? data.threads?.[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(`admin-chat-${channelName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_messages' }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, channelName])

  const scopedThreads = homeFilter ? threads.filter((thread) => !filterHomeId || thread.home_id === filterHomeId) : threads
  const visibleThreads = scopedThreads.filter((thread) =>
    view === 'archived' ? Boolean(thread.archived_at) : !thread.archived_at,
  )
  const archivedCount = scopedThreads.filter((thread) => Boolean(thread.archived_at)).length

  // Keep the open conversation inside the current home + tab.
  useEffect(() => {
    if (visibleThreads.length > 0 && !visibleThreads.some((thread) => thread.id === activeId)) {
      setActiveId(visibleThreads[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterHomeId, threads, activeId, view])

  const activeThread = visibleThreads.find((thread) => thread.id === activeId) ?? null
  const threadMessages = messages.filter((message) => message.thread_id === activeId)

  // Date separators, WhatsApp-style: one divider per calendar day.
  const rows: Array<{ kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: Message }> = []
  let lastDay = ''
  for (const message of threadMessages) {
    const key = dayKey(message.created_at)
    if (key !== lastDay) {
      rows.push({ kind: 'day', key: `day-${key}`, label: dayLabel(message.created_at) })
      lastDay = key
    }
    rows.push({ kind: 'message', key: message.id, message })
  }

  const reply = async (event: React.FormEvent) => {
    event.preventDefault()
    const message = draft.trim()
    if (!activeId || !message) return
    setSending(true)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: activeId, message, urgent }),
    })
    if (!response.ok) {
      toast.error('Reply could not be sent.')
      setSending(false)
      return
    }
    setDraft('')
    setUrgent(false)
    setSending(false)
    toast.success('Reply sent to the home.')
    void load()
  }

  const toggleArchive = async (thread: Thread) => {
    const archived = !thread.archived_at
    setBusyId(thread.id)
    const response = await fetch(endpoint, {
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
    await load()
  }

  const startConversation = async (event: React.FormEvent) => {
    event.preventDefault()
    const message = newMessage.trim()
    if (!newHomeId) {
      toast.error('Choose a nursing home to message.')
      return
    }
    if (!message) {
      toast.error('Write the first message.')
      return
    }
    setCreating(true)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ homeId: newHomeId, subject: newSubject, residentRef: newResident, message, urgent }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? 'Conversation could not be started.')
      setCreating(false)
      return
    }
    if (data?.thread?.id) setActiveId(data.thread.id)
    setNewHomeId('')
    setNewSubject('')
    setNewResident('')
    setNewMessage('')
    setUrgent(false)
    setShowNew(false)
    setCreating(false)
    toast.success('Conversation started with the nursing home.')
    await load()
  }

  return (
    <div className="grid grid-cols-1 border border-hairline bg-paper lg:h-[min(78svh,46rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
      {/* thread list */}
      <div className="flex min-w-0 flex-col border-b border-hairline lg:min-h-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 border-b border-hairline p-4">
          <p className="eyebrow text-forest-soft/80">Conversations</p>
          {allowNew && (
            <button
              type="button"
              onClick={() => {
                setShowNew((value) => !value)
                if (homeFilter && filterHomeId) setNewHomeId(filterHomeId)
              }}
              className="inline-flex h-9 items-center gap-1.5 border border-hairline px-3 text-xs font-semibold text-forest hover:bg-mint"
            >
              {showNew ? <X className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
              {showNew ? 'Cancel' : 'New'}
            </button>
          )}
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

        {homeFilter && (
          <div className="border-b border-hairline bg-cream p-4">
            <label htmlFor="home-filter" className="eyebrow block text-muted-foreground">
              Nursing home
            </label>
            <select
              id="home-filter"
              value={filterHomeId}
              onChange={(event) => setFilterHomeId(event.target.value)}
              className="mt-2 h-10 w-full border border-hairline bg-paper px-3 text-sm focus:border-forest"
            >
              <option value="">All nursing homes</option>
              {homes.map((home) => (
                <option key={home.id} value={home.id}>
                  {home.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {allowNew && showNew && (
          <form onSubmit={startConversation} className="space-y-3 border-b border-hairline bg-cream p-4">
            <div>
              <label htmlFor="new-home" className="mb-1 block text-xs font-medium">
                Nursing home
              </label>
              <select
                id="new-home"
                value={newHomeId}
                onChange={(event) => setNewHomeId(event.target.value)}
                className="h-10 w-full border border-hairline bg-paper px-3 text-sm focus:border-forest"
              >
                <option value="">{homes.length === 0 ? 'No nursing homes yet' : 'Select a nursing home'}</option>
                {homes.map((home) => (
                  <option key={home.id} value={home.id}>
                    {home.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-subject" className="mb-1 block text-xs font-medium">
                Subject
              </label>
              <input
                id="new-subject"
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
                placeholder="Medication supply"
                className="h-10 w-full border border-hairline bg-paper px-3 text-sm focus:border-forest"
              />
            </div>
            <div>
              <label htmlFor="new-resident" className="mb-1 block text-xs font-medium">
                Resident ID or initials
              </label>
              <input
                id="new-resident"
                value={newResident}
                onChange={(event) => setNewResident(event.target.value)}
                placeholder="e.g. 2B-014"
                className="h-10 w-full border border-hairline bg-paper px-3 font-mono text-sm focus:border-forest"
              />
            </div>
            <div>
              <label htmlFor="new-message" className="mb-1 block text-xs font-medium">
                First message
              </label>
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

        <ul className="max-h-72 divide-y divide-hairline overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
          {loading && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
          {!loading && visibleThreads.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              {view === 'archived' ? 'No archived conversations.' : 'No conversations yet.'}
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
                    <span className="rounded-badge bg-terracotta px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                      Urgent
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {homeLabel(thread)}
                  {thread.member?.name ? ` · ${thread.member.name}` : ''}
                </p>
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

      {/* conversation */}
      <div className="flex h-[32rem] min-w-0 flex-col lg:h-auto lg:min-h-0">
        {activeThread ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight">{homeLabel(activeThread)}</h2>
                  <span className="rounded-badge bg-brand-tint px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-brand uppercase">
                    {activeThread.subject}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  Secure channel · shared with the Nursing Home portal
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeThread.archived_at && (
                  <span className="rounded-badge inline-flex items-center gap-1.5 border border-hairline bg-cream px-2.5 py-1 text-xs text-muted-foreground">
                    <Archive className="size-3.5" aria-hidden="true" />
                    Archived {stamp(activeThread.archived_at)}
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
              {threadMessages.length === 0 && <li className="text-sm text-muted-foreground">No messages yet.</li>}
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
            </ol>

            <form onSubmit={reply} className="border-t border-hairline p-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUrgent((value) => !value)}
                  aria-pressed={urgent}
                  aria-label="Flag reply as urgent"
                  className={cn(
                    'grid size-12 place-items-center rounded-field border',
                    urgent ? 'border-terracotta bg-terracotta text-white' : 'border-hairline text-muted-foreground hover:bg-cream',
                  )}
                >
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Reply to the home…"
                  aria-label="Reply"
                  className="h-12 min-w-0 flex-1 border border-hairline bg-cream px-4 text-sm focus:border-forest"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="inline-flex h-12 items-center gap-2 bg-forest px-5 text-sm font-semibold text-cream disabled:opacity-50"
                >
                  {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  Reply
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">
            {view === 'archived'
              ? 'No archived conversation selected.'
              : allowNew
                ? 'Select a conversation or start a new one with a nursing home.'
                : 'Select a conversation to reply.'}
          </div>
        )}
      </div>
    </div>
  )
}
