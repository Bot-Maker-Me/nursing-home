'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Mail, Plus, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/common/toast'

type Thread = {
  id: string
  subject: string
  resident_ref: string
  urgent: boolean
  last_message_at: string
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

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const stamp = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

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
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelName = useId().replace(/[^a-zA-Z0-9]/g, '')

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  return (
    <div className="mt-8 grid grid-cols-1 border border-hairline bg-paper lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="min-w-0 border-b border-hairline lg:border-r lg:border-b-0">
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

        <ul className="max-h-72 divide-y divide-hairline overflow-y-auto lg:max-h-[28rem]" aria-label="Threads">
          {loadingThreads && <li className="p-4 text-sm text-muted-foreground">Loading conversations…</li>}
          {!loadingThreads && threads.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No conversations yet. Start one with the pharmacy.</li>
          )}
          {threads.map((thread) => (
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
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-[22rem] min-w-0 flex-col lg:min-h-[32rem]">
        {activeThread ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-5">
              <div>
                <p className="font-semibold">{activeThread.subject}</p>
                <p className="font-mono text-xs text-forest-soft">{activeThread.resident_ref || 'No resident reference'}</p>
              </div>
              {activeThread.urgent && (
                <span className="rounded-badge bg-terracotta px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">Urgent</span>
              )}
            </div>

            <ol className="min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-5">
              {loadingMessages && <li className="text-sm text-muted-foreground">Loading messages…</li>}
              {!loadingMessages && messages.length === 0 && (
                <li className="text-sm text-muted-foreground">No messages in this conversation yet.</li>
              )}
              {messages.map((message) => {
                const mine = message.sender_role === 'home'
                return (
                  <li key={message.id} className={cn('flex', mine && 'justify-end')}>
                    <div className={cn('max-w-[85%] rounded-card border p-4 sm:max-w-md', mine ? 'border-forest bg-forest text-cream' : 'border-hairline bg-cream')}>
                      <p className={cn('flex items-center gap-2 text-xs', mine ? 'text-cream/70' : 'text-muted-foreground')}>
                        {message.sender_name} · <span className="font-mono">{clock(message.created_at)}</span>
                        {message.urgent && (
                          <span className="rounded-badge bg-terracotta px-1.5 text-[10px] font-bold uppercase text-white">Urgent</span>
                        )}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
                      <p className={cn('mt-2 text-[11px]', mine ? 'text-cream/60' : 'text-muted-foreground')}>
                        {mine ? (message.read_at ? 'Read by pharmacy' : 'Sent') : message.read_at ? 'Read' : 'Delivered'}
                      </p>
                    </div>
                  </li>
                )
              })}
              <div ref={bottomRef} />
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
  )
}
