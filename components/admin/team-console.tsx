'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/brand/logo'
import { Card } from '@/components/portal/page-header'

const fieldClass = 'h-11 w-full border border-hairline bg-cream px-3 text-sm focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20'

type Invite = { id?: string; email: string; code: string; home_name: string; expires_at: string; accepted_at?: string | null }

export function TeamConsole() {
  const [email, setEmail] = useState('')
  const [invites, setInvites] = useState<Invite[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [users, setUsers] = useState<{ id: string; email?: string; name: string; assignedPharmacist: string; homeName: string }[]>([])
  const [assignedPharmacist, setAssignedPharmacist] = useState('')
  const [homeName, setHomeName] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [messages, setMessages] = useState<{ id: string; user_id: string; sender_role: string; sender_name: string; body: string; created_at: string }[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([
      fetch('/api/admin/invitations').then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to load invitations.'); return response.json() }),
      fetch('/api/admin/messages').then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to load messages.') ; return response.json() }),
      fetch('/api/admin/users').then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to load users.'); return response.json() }),
    ]).then(([inviteData, messageData, data]) => {
      setInvites(inviteData)
      setMessages(messageData)
      setUsers(data)
      if (data[0]) {
        setSelectedUserId(data[0].id)
        setAssignedPharmacist(data[0].assignedPharmacist)
        setHomeName(data[0].homeName)
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load admin data.')).finally(() => setLoading(false))
  }, [])

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(''); setError('')
    const response = await fetch('/api/admin/invitations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = await response.json()
    if (!response.ok) { setError(data.error ?? 'Unable to create invitation.'); return }
    setInvites((current) => [data, ...current]); setEmail(''); setMessage(`Invitation code: ${data.code}`)
  }

  const updateAssignment = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(''); setError('')
    const response = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: selectedUserId, assignedPharmacist, homeName }) })
    const data = await response.json()
    if (!response.ok) { setError(data.error ?? 'Unable to save assignment.'); return }
    setUsers((current) => current.map((user) => user.id === selectedUserId ? { ...user, assignedPharmacist, homeName } : user))
    setMessage('User assignment saved.')
  }

  const sendAdminMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    const message = chatDraft.trim()
    if (!selectedUserId || !message) return
    const response = await fetch('/api/admin/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: selectedUserId, message }) })
    if (!response.ok) { setError('Message could not be sent.'); return }
    const item = await response.json()
    setMessages((current) => [...current, item])
    setChatDraft('')
    setMessage('Message sent to the selected member.')
  }

  const upload = async (file: File) => {
    setUploading(true); setMessage(''); setError('')
    if (!selectedUserId) {
      setError('Create or select a portal user before uploading a document.')
      setUploading(false)
      return
    }
    const form = new FormData()
    form.set('file', file)
    form.set('userId', selectedUserId)
    const response = await fetch('/api/admin/documents', { method: 'POST', body: form })
    const data = await response.json()
    if (!response.ok) setError(data.error ?? 'Upload failed.')
    else setMessage(`${data.name} is now available to that portal user.`)
    setUploading(false)
  }

  return <div className="min-h-dvh lg:flex">
    <aside className="bg-sidebar px-5 py-6 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-72 lg:shrink-0 lg:flex-col lg:gap-10"><Link href="/admin"><Logo tone="light" /></Link><div><p className="eyebrow text-sidebar-foreground/60">Team administration</p><p className="mt-3 text-2xl font-semibold text-white">Client setup</p><p className="mt-2 text-sm text-sidebar-foreground/70">Manage every account, assignment, conversation, cutoff, delivery, policy and contact.</p><nav className="mt-8 space-y-1 text-sm" aria-label="Admin sections">{['User accounts','Pharmacy messages','Deliveries','Order cut-offs','Policies','Contacts'].map((label) => <a key={label} href={`#${label.toLowerCase().replaceAll(' ', '-')}`} className="block border-l border-sidebar-border px-3 py-2 text-sidebar-foreground/80 hover:border-[#f0d36b] hover:text-white">{label}</a>)}</nav></div></aside>
    <main className="min-w-0 flex-1"><div className="mx-auto max-w-5xl space-y-6 px-5 py-10 sm:px-8 lg:px-12 lg:py-14"><header className="border-b border-hairline pb-8"><p className="eyebrow text-forest-soft/80">Private team console</p><h1 className="mt-3 text-4xl font-bold tracking-[-0.045em] sm:text-6xl">Portal administration</h1><p className="mt-3 text-sm text-muted-foreground">Invitation codes and documents are stored in Supabase and scoped to the selected user.</p></header>
      {loading && <p role="status" className="border border-hairline bg-paper px-4 py-3 text-sm text-muted-foreground">Loading live admin data…</p>}{message && <p role="status" className="border border-forest/30 bg-mint px-4 py-3 text-sm text-forest">{message}</p>}{error && <p role="alert" className="border border-terracotta/40 bg-terracotta/5 px-4 py-3 text-sm text-terracotta">{error}</p>}
      <div id="user-accounts"><Card eyebrow="User management" title="Invite a portal user"><form onSubmit={createInvite} className="flex flex-col gap-3 sm:flex-row"><label htmlFor="invite-email" className="sr-only">Invite by email</label><input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="partner@carehome.ca" className={`${fieldClass} flex-1`} /><button className="h-11 bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep">Create invitation</button></form><p className="mt-3 text-xs text-muted-foreground">Copy the generated code and send it to the user. They enter it under “Activate invitation”.</p>{invites.length > 0 && <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="border-y border-hairline text-left"><th className="py-3 pr-4">Email</th><th className="py-3 pr-4">Code</th><th className="py-3 pr-4">Expires</th><th className="py-3">Status</th></tr></thead><tbody className="divide-y divide-hairline">{invites.map((invite) => <tr key={invite.id ?? invite.code}><td className="py-3 pr-4">{invite.email}</td><td className="py-3 pr-4 font-mono font-semibold">{invite.code}</td><td className="py-3 pr-4 text-muted-foreground">{new Date(invite.expires_at).toLocaleDateString()}</td><td className="py-3">{invite.accepted_at ? 'Accepted' : 'Ready'}</td></tr>)}</tbody></table></div>}</Card></div>
      <div id="portal-users"><Card eyebrow="Portal users" title="Assign pharmacist and home">
        <form onSubmit={updateAssignment} className="space-y-4">
          <div><label htmlFor="assignment-user" className="mb-2 block text-sm font-medium">Account</label><select id="assignment-user" value={selectedUserId} onChange={(event) => { const next = users.find((user) => user.id === event.target.value); setSelectedUserId(event.target.value); setAssignedPharmacist(next?.assignedPharmacist ?? ''); setHomeName(next?.homeName ?? '') }} className={fieldClass}><option value="">Select a portal user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></div>
          <div><label htmlFor="assigned-pharmacist" className="mb-2 block text-sm font-medium">Assigned pharmacist</label><input id="assigned-pharmacist" required value={assignedPharmacist} onChange={(event) => setAssignedPharmacist(event.target.value)} placeholder="Dr. Priya Raman, RPh" className={fieldClass} /></div>
          <div><label htmlFor="assigned-home" className="mb-2 block text-sm font-medium">Home</label><input id="assigned-home" value={homeName} onChange={(event) => setHomeName(event.target.value)} placeholder="Maple Ridge Care Home" className={fieldClass} /></div>
          <button className="h-11 bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep">Save assignment</button>
        </form>
      </Card></div>
      <div id="pharmacy-messages"><Card eyebrow="Pharmacy messages" title="Chat with nursing home members">
        <div className="max-h-80 space-y-3 overflow-y-auto border border-hairline bg-cream p-4">
          {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet. Conversations will appear here when a member sends one.</p> : messages.map((item) => <div key={item.id} className={`max-w-xl border p-3 text-sm ${item.sender_role === 'pharmacy' ? 'ml-auto border-forest bg-mint' : 'border-hairline bg-paper'}`}><p className="text-xs text-muted-foreground">{item.sender_name} · {new Date(item.created_at).toLocaleString()}</p><p className="mt-1">{item.body}</p></div>)}
        </div>
        <form onSubmit={sendAdminMessage} className="mt-4 flex flex-col gap-3 sm:flex-row"><label htmlFor="admin-member" className="sr-only">Member</label><select id="admin-member" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className={`${fieldClass} sm:w-64`}><option value="">Select member</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select><label htmlFor="admin-message" className="sr-only">Message</label><input id="admin-message" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Write a reply…" className={`${fieldClass} flex-1`} /><button className="h-11 bg-forest px-5 text-sm font-semibold text-cream">Send</button></form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Persistent account chat, similar to WhatsApp, scoped to the selected member. Members can open email for orders from the portal.</p><button type="button" className="text-xs font-semibold text-terracotta underline" onClick={async () => { if (!selectedUserId || !window.confirm('Clear this member’s conversation?')) return; const response = await fetch('/api/admin/messages', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: selectedUserId }) }); if (response.ok) { setMessages((current) => current.filter((item) => item.user_id !== selectedUserId)); setMessage('Selected conversation cleared.'); } }}>Clear selected conversation</button></div>
      </Card></div>
      <div id="policies"><Card eyebrow="Policy documents" title="Upload for a specific user"><label htmlFor="document-user" className="mb-2 block text-sm font-medium">Recipient account</label><select id="document-user" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className={`${fieldClass} mb-4`}><option value="">Select a portal user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select><div onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void upload(file) }} className="grid cursor-pointer place-items-center border border-dashed border-forest-soft/50 px-6 py-10 text-center hover:bg-mint"><p className="text-sm"><span className="font-semibold text-forest">{uploading ? 'Uploading…' : 'Drop a file here or choose one'}</span></p><p className="mt-2 text-xs text-muted-foreground">PDF, Word, Excel or CSV · max 25 MB</p><input ref={fileRef} type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} /></div><p className="mt-3 text-xs text-muted-foreground">Files are stored privately and linked to the selected account. Only that signed-in user can read them.</p></Card></div>
    </div></main></div>
}
