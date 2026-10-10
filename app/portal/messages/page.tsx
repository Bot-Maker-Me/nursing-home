'use client'

import { useEffect, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { PageHeader } from '@/components/portal/page-header'
import { currentHome, threads } from '@/lib/sample-data'

export default function MessagesPage() {
  const active = threads[0] ?? { id: 'new', subject: 'New conversation with Henderson’s Pharmacy', resident: 'Use resident ID or initials only', last: 'Start a secure message', author: 'Pharmacy team', time: '', unread: 0 }
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<{ from: string; who: string; time: string; text: string }[]>([])
  const [status, setStatus] = useState('Loading secure conversation…')
  useEffect(() => {
    void fetch('/api/portal/messages').then(async (response) => {
      if (!response.ok) { setStatus('Secure chat is ready after the Supabase messages migration is applied.'); return }
      const data = await response.json()
      setMessages(data.map((item: { sender_role: string; sender_name: string; body: string; created_at: string }) => ({ from: item.sender_role, who: item.sender_name, time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: item.body })))
      setStatus('Messages are saved securely to this account.')
    })
  }, [])
  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    const response = await fetch('/api/portal/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text }) })
    if (!response.ok) { setStatus('Message could not be saved. Apply the Supabase messages migration first.'); return }
    const item = await response.json()
    setMessages((current) => [...current, { from: item.sender_role, who: item.sender_name, time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: item.body }])
    setDraft('')
    setStatus('Message saved securely to this account.')
  }
  return (
    <>
      <PageHeader
        crumb={`${currentHome.name} / Connect with Pharmacy`}
        title="Connect with Pharmacy"
        description="For communication only — this is not an ordering channel. Use resident IDs or initials, never full names."
      />
      <div className="mt-8 grid border border-hairline bg-paper lg:grid-cols-[20rem_1fr]">
        <ul className="divide-y divide-hairline border-b border-hairline lg:border-r lg:border-b-0" aria-label="Threads">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-current={t.id === active.id ? 'true' : undefined}
                className={`w-full p-4 text-left ${t.id === active.id ? 'bg-cream' : 'hover:bg-cream/50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.subject}</span>
                  {t.unread > 0 && <span className="bg-terracotta px-1.5 font-mono text-[11px] text-white">{t.unread}</span>}
                </div>
                {t.resident && <p className="mt-1 font-mono text-xs text-forest-soft">{t.resident}</p>}
                <p className="mt-1 truncate text-xs text-muted-foreground">{t.last}</p>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex min-h-[32rem] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-5">
            <div>
              <p className="font-semibold">{active.subject}</p>
              <p className="font-mono text-xs text-forest-soft">{active.resident}</p>
            </div>
            <span className="bg-terracotta px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">Urgent</span>
          </div>
          <ol className="flex-1 space-y-5 p-5">
            {messages.map((m, i) => (
              <li key={i} className={`flex ${m.from === 'home' ? 'justify-end' : ''}`}>
                <div className={`max-w-md border p-4 ${m.from === 'home' ? 'border-forest bg-forest text-cream' : 'border-hairline bg-cream'}`}>
                  <p className={`text-xs ${m.from === 'home' ? 'text-cream/70' : 'text-muted-foreground'}`}>
                    {m.who} · <span className="font-mono">{m.time}</span>
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed">{m.text}</p>
                </div>
              </li>
            ))}
            <li className="text-right text-xs text-muted-foreground">Read by J. Ellis · 14:13</li>
          </ol>
          <form onSubmit={sendMessage} className="border-t border-hairline p-4">
            <label htmlFor="msg" className="sr-only">
              Message
            </label>
            <div className="flex gap-2">
              <button type="button" className="grid size-12 place-items-center border border-hairline text-muted-foreground" aria-label="Attach file">
                <Paperclip className="size-4" />
              </button>
              <input id="msg" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write to the pharmacy…" className="h-12 flex-1 border border-hairline bg-cream px-4 text-sm focus:border-forest focus:outline-none" />
              <button type="submit" disabled={!draft.trim()} className="h-12 bg-forest px-5 text-sm font-semibold text-cream disabled:opacity-50">
                Send
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{status}</span><a className="font-semibold text-forest underline" href={`mailto:pharmacy@hendersonsportal.ca?subject=${encodeURIComponent(`Order request · ${active.subject}`)}&body=${encodeURIComponent(draft)}`}>Open email for an order</a></div>
          </form>
        </div>
      </div>
    </>
  )
}
