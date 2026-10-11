'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Send, X } from 'lucide-react'
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
  homeName?: string
  member: { name: string; home: string } | null
}
type Message = { id: string; thread_id: string; sender_role: string; sender_name: string; body: string; urgent: boolean; read_at: string | null; created_at: string }
type Home = { id: string; name: string; city?: string }

const clock = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const homeLabel = (thread: Thread) => thread.homeName || thread.member?.home || 'Unassigned home'

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
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
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

  const visibleThreads = homeFilter
    ? threads.filter((thread) => !filterHomeId || thread.home_id === filterHomeId)
    : threads

  // Keep the open conversation within the selected nursing home.
  useEffect(() => {
    if (!homeFilter) return
    if (visibleThreads.length > 0 && !visibleThreads.some((thread) => thread.id === activeId)) {
      setActiveId(visibleThreads[0].id)
    }
  }, [homeFilter, filterHomeId, threads, activeId])

  const activeThread = visibleThreads.find((thread) => thread.id === activeId) ?? null
  const threadMessages = messages.filter((message) => message.thread_id === activeId)

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
    <div className="grid grid-cols-1 border border-hairline bg-paper lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="min-w-0 border-b border-hairline lg:border-r lg:border-b-0">
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

        {homeFilter && (
          <div className="border-b border-hairline bg-cream p-4">
            <label htmlFor="home-filter" className="eyebrow block text-muted-foreground">
              Nursing home
            </label>
            <select
              id="home-filter"
              value={filterHomeId}
              onChange={(event) => setFilterHomeId(event.target.value)}
              className="mt-2 h-10 w-full border border-hairline bg-paper px-3 text-sm focus:border-forest focus:outline-none"
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
              <label htmlFor="new-home" className="mb-1 block text-xs font-medium">Nursing home</label>
              <select
                id="new-home"
                value={newHomeId}
                onChange={(event) => setNewHomeId(event.target.value)}
                className="h-10 w-full border border-hairline bg-paper px-3 text-sm focus:border-forest focus:outline-none"
              >
                <option value="">{homes.length === 0 ? 'No nursing homes yet' : 'Select a nursing home'}</option>
                {homes.map((home) => (
                  <option key={home.id} value={home.id}>{home.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-subject" className="mb-1 block text-xs font-medium">Subject</label>
              <input
                id="new-subject"
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
                placeholder="Medication supply"
                className="h-10 w-full border border-hairline bg-paper px-3 text-sm focus:border-forest focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="new-resident" className="mb-1 block text-xs font-medium">Resident ID or initials</label>
              <input
                id="new-resident"
                value={newResident}
                onChange={(event) => setNewResident(event.target.value)}
                placeholder="e.g. 2B-014"
                className="h-10 w-full border border-hairline bg-paper px-3 font-mono text-sm focus:border-forest focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="new-message" className="mb-1 block text-xs font-medium">First message</label>
              <textarea
                id="new-message"
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                rows={3}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:border-forest focus:outline-none"
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

        <ul className="max-h-72 divide-y divide-hairline overflow-y-auto lg:max-h-[26rem]">
          {loading && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
          {!loading && visibleThreads.length === 0 && <li className="p-4 text-sm text-muted-foreground">No conversations yet.</li>}
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
                  {thread.urgent && <span className="bg-terracotta px-1.5 text-[10px] font-bold uppercase text-white">Urgent</span>}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {homeLabel(thread)}
                  {thread.member?.name ? ` · ${thread.member.name}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-[26rem] min-w-0 flex-col">
        {activeThread ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-5">
              <div className="min-w-0">
                <p className="truncate font-semibold">{activeThread.subject}</p>
                <p className="font-mono text-xs text-forest-soft">{activeThread.resident_ref || 'No resident reference'}</p>
              </div>
              <span className="text-xs text-muted-foreground">{homeLabel(activeThread)}</span>
            </div>
            <ol className="min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-5">
              {threadMessages.length === 0 && <li className="text-sm text-muted-foreground">No messages yet.</li>}
              {threadMessages.map((message) => {
                const mine = message.sender_role === 'pharmacy'
                return (
                  <li key={message.id} className={cn('flex', mine && 'justify-end')}>
                    <div className={cn('max-w-md border p-4', mine ? 'border-forest bg-mint' : 'border-hairline bg-cream')}>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        {message.sender_name} · <span className="font-mono">{clock(message.created_at)}</span>
                        {message.urgent && <span className="bg-terracotta px-1.5 text-[10px] font-bold uppercase text-white">Urgent</span>}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
                      {!mine && <p className="mt-2 text-[11px] text-muted-foreground">{message.read_at ? 'Read' : 'Unread'}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
            <form onSubmit={reply} className="border-t border-hairline p-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUrgent((value) => !value)}
                  aria-pressed={urgent}
                  aria-label="Flag reply as urgent"
                  className={cn('grid size-12 place-items-center border', urgent ? 'border-terracotta bg-terracotta text-white' : 'border-hairline text-muted-foreground hover:bg-cream')}
                >
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Reply to the home…"
                  aria-label="Reply"
                  className="h-12 min-w-0 flex-1 border border-hairline bg-cream px-4 text-sm focus:border-forest focus:outline-none"
                />
                <button type="submit" disabled={!draft.trim() || sending} className="inline-flex h-12 items-center gap-2 bg-forest px-5 text-sm font-semibold text-cream disabled:opacity-50">
                  {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  Reply
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">
            {allowNew ? 'Select a conversation or start a new one with a nursing home.' : 'Select a conversation to reply.'}
          </div>
        )}
      </div>
    </div>
  )
}
