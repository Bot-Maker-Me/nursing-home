'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/common/toast'

type Thread = { id: string; subject: string; resident_ref: string; urgent: boolean; created_by: string; last_message_at: string; member: { name: string; home: string } | null }
type Message = { id: string; thread_id: string; sender_role: string; sender_name: string; body: string; urgent: boolean; read_at: string | null; created_at: string }

const clock = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ThreadConsole({ endpoint = '/api/admin/threads' }: { endpoint?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = async () => {
    const response = await fetch(endpoint)
    if (!response.ok) {
      setLoading(false)
      return
    }
    const data: { threads: Thread[]; messages: Message[] } = await response.json()
    setThreads(data.threads)
    setMessages(data.messages)
    setActiveId((current) => current ?? data.threads[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('admin-chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_messages' }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase])

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null
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

  return (
    <div className="grid border border-hairline bg-paper lg:grid-cols-[20rem_1fr]">
      <div className="border-b border-hairline lg:border-r lg:border-b-0">
        <p className="eyebrow border-b border-hairline p-4 text-forest-soft/80">Conversations</p>
        <ul className="max-h-[26rem] divide-y divide-hairline overflow-y-auto">
          {loading && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
          {!loading && threads.length === 0 && <li className="p-4 text-sm text-muted-foreground">No conversations yet.</li>}
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
                  {thread.urgent && <span className="bg-terracotta px-1.5 text-[10px] font-bold uppercase text-white">Urgent</span>}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{thread.member?.name ?? 'Portal user'}{thread.member?.home ? ` · ${thread.member.home}` : ''}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-[26rem] flex-col">
        {activeThread ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-5">
              <div>
                <p className="font-semibold">{activeThread.subject}</p>
                <p className="font-mono text-xs text-forest-soft">{activeThread.resident_ref || 'No resident reference'}</p>
              </div>
              <span className="text-xs text-muted-foreground">{activeThread.member?.name ?? 'Portal user'}</span>
            </div>
            <ol className="flex-1 space-y-4 overflow-y-auto p-5">
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
                  className="h-12 flex-1 border border-hairline bg-cream px-4 text-sm focus:border-forest focus:outline-none"
                />
                <button type="submit" disabled={!draft.trim() || sending} className="inline-flex h-12 items-center gap-2 bg-forest px-5 text-sm font-semibold text-cream disabled:opacity-50">
                  {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  Reply
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">Select a conversation to reply.</div>
        )}
      </div>
    </div>
  )
}
