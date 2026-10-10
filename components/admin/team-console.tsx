'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Loader2, Plus, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Card } from '@/components/portal/page-header'
import { DataManager, type Entity } from '@/components/admin/data-manager'
import { ThreadConsole } from '@/components/admin/thread-console'
import { useToast } from '@/components/common/toast'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const field = 'h-11 w-full border border-hairline bg-cream px-3 text-sm focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20'

type Invite = { id?: string; email: string; code: string; home_name: string; expires_at: string; accepted_at?: string | null }
type PortalUser = { id: string; email?: string; name: string; assignedPharmacist: string; homeName: string; homeId: string }

const NAV = [
  { id: 'clients', label: 'Clients & pharmacies' },
  { id: 'users', label: 'User accounts' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'data', label: 'Data manager' },
]

export function TeamConsole() {
  const supabase = useMemo(() => createClient(), [])
  const toast = useToast()
  const [homes, setHomes] = useState<Entity[]>([])
  const [pharmacies, setPharmacies] = useState<Entity[]>([])
  const [users, setUsers] = useState<PortalUser[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)

  const [entityType, setEntityType] = useState<'client' | 'pharmacy'>('client')
  const [entityName, setEntityName] = useState('')
  const [entityDetail, setEntityDetail] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [assignedPharmacist, setAssignedPharmacist] = useState('')
  const [homeName, setHomeName] = useState('')
  const [homeId, setHomeId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void Promise.all([
      fetch('/api/admin/entities').then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to load clients.'); return response.json() }),
      fetch('/api/admin/users').then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to load users.'); return response.json() }),
      fetch('/api/admin/invitations').then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to load invitations.'); return response.json() }),
    ])
      .then(([entities, userData, inviteData]) => {
        setHomes(entities.homes ?? [])
        setPharmacies(entities.pharmacies ?? [])
        setUsers(userData)
        setInvites(inviteData)
        if (userData[0]) selectUser(userData[0])
      })
      .catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : 'Unable to load admin data.'))
      .finally(() => setLoading(false))
  }, [toast])

  function selectUser(user: PortalUser) {
    setSelectedUserId(user.id)
    setAssignedPharmacist(user.assignedPharmacist)
    setHomeName(user.homeName)
    setHomeId(user.homeId)
  }

  const createEntity = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!entityName.trim()) {
      toast.error('Enter a name.')
      return
    }
    setBusy(true)
    const response = await fetch('/api/admin/entities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: entityType,
        name: entityName,
        city: entityType === 'client' ? entityDetail : undefined,
        email: entityType === 'pharmacy' ? entityDetail : undefined,
      }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? 'Unable to create this record.')
      setBusy(false)
      return
    }
    const entity: Entity = { id: data.record.id, name: data.record.name }
    if (entityType === 'client') setHomes((current) => [...current, entity].sort((a, b) => a.name.localeCompare(b.name)))
    else setPharmacies((current) => [...current, entity].sort((a, b) => a.name.localeCompare(b.name)))
    setEntityName('')
    setEntityDetail('')
    setBusy(false)
    toast.success(`${entityType === 'client' ? 'Client' : 'Pharmacy'} “${entity.name}” created.`)
  }

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const response = await fetch('/api/admin/invitations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: inviteEmail }) })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? 'Unable to create invitation.')
      setBusy(false)
      return
    }
    setInvites((current) => [data, ...current])
    setInviteEmail('')
    setBusy(false)
    toast.success(`Invitation created. Code: ${data.code}`)
  }

  const saveAssignment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedUserId) {
      toast.error('Select a portal user.')
      return
    }
    setBusy(true)
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: selectedUserId, assignedPharmacist, homeName, homeId }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? 'Unable to save assignment.')
      setBusy(false)
      return
    }
    setUsers((current) => current.map((user) => (user.id === selectedUserId ? { ...user, assignedPharmacist, homeName, homeId } : user)))
    setBusy(false)
    toast.success('Assignment saved.')
  }

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="bg-sidebar px-5 py-6 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-72 lg:shrink-0 lg:flex-col lg:gap-8">
        <Link href="/admin"><Logo tone="light" /></Link>
        <div>
          <p className="eyebrow text-sidebar-foreground/60">Team administration</p>
          <p className="mt-3 text-2xl font-semibold text-white">Client setup</p>
          <nav className="mt-6 space-y-1 text-sm" aria-label="Admin sections">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="block border-l border-sidebar-border px-3 py-2 text-sidebar-foreground/80 hover:border-[#f0d36b] hover:text-white">
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/sign-in' })}
          className="mt-auto h-11 border border-sidebar-border text-sm font-medium text-sidebar-foreground/80 hover:text-white"
        >
          Sign out
        </button>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl space-y-8 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
          <header className="border-b border-hairline pb-8">
            <p className="eyebrow flex items-center gap-2 text-forest-soft/80">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Private team console
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-[-0.045em] sm:text-6xl">Portal administration</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Manage clients and pharmacies, portal users, live conversations, and every data section scoped to a selected client or pharmacy.
            </p>
          </header>

          {loading && (
            <p role="status" className="flex items-center gap-2 border border-hairline bg-paper px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading live admin data…
            </p>
          )}

          <section id="clients">
            <Card eyebrow="Clients & pharmacies" title="Create a client or pharmacy">
              <form onSubmit={createEntity} className="space-y-4">
                <div className="flex gap-2">
                  {(['client', 'pharmacy'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setEntityType(type); setEntityDetail('') }}
                      aria-pressed={entityType === type}
                      className={cn('h-11 flex-1 border text-sm font-medium', entityType === type ? 'border-forest bg-forest text-cream' : 'border-hairline text-muted-foreground hover:bg-cream')}
                    >
                      {type === 'client' ? 'Long-term care home' : 'Pharmacy'}
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="entity-name" className="mb-2 block text-sm font-medium">Name</label>
                    <input id="entity-name" value={entityName} onChange={(event) => setEntityName(event.target.value)} placeholder={entityType === 'client' ? 'Maple Ridge Care Home' : "Henderson's Pharmacy"} className={field} />
                  </div>
                  <div>
                    <label htmlFor="entity-detail" className="mb-2 block text-sm font-medium">{entityType === 'client' ? 'City' : 'Email'}</label>
                    <input id="entity-detail" value={entityDetail} onChange={(event) => setEntityDetail(event.target.value)} placeholder={entityType === 'client' ? 'Hamilton, ON' : 'pharmacy@example.ca'} className={field} />
                  </div>
                </div>
                <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50">
                  <Plus className="size-4" aria-hidden="true" />
                  Create {entityType === 'client' ? 'client' : 'pharmacy'}
                </button>
              </form>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="eyebrow text-muted-foreground">Clients ({homes.length})</p>
                  <ul className="mt-2 divide-y divide-hairline border-y border-hairline text-sm">
                    {homes.length === 0 && <li className="py-3 text-muted-foreground">None yet.</li>}
                    {homes.map((home) => (
                      <li key={home.id} className="flex items-center gap-2 py-2.5">
                        <Building2 className="size-4 text-forest" aria-hidden="true" />
                        {home.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">Pharmacies ({pharmacies.length})</p>
                  <ul className="mt-2 divide-y divide-hairline border-y border-hairline text-sm">
                    {pharmacies.length === 0 && <li className="py-3 text-muted-foreground">None yet.</li>}
                    {pharmacies.map((pharmacy) => (
                      <li key={pharmacy.id} className="py-2.5">{pharmacy.name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </section>

          <section id="users">
            <Card eyebrow="User management" title="Invite a portal user">
              <form onSubmit={createInvite} className="flex flex-col gap-3 sm:flex-row">
                <label htmlFor="invite-email" className="sr-only">Invite by email</label>
                <input id="invite-email" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="partner@carehome.ca" className={`${field} flex-1`} />
                <button type="submit" disabled={busy} className="h-11 bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50">Create invitation</button>
              </form>
              {invites.length > 0 && (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-y border-hairline text-left">
                        <th className="py-3 pr-4">Email</th>
                        <th className="py-3 pr-4">Code</th>
                        <th className="py-3 pr-4">Expires</th>
                        <th className="py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {invites.map((invite) => (
                        <tr key={invite.id ?? invite.code}>
                          <td className="py-3 pr-4">{invite.email}</td>
                          <td className="py-3 pr-4 font-mono font-semibold">{invite.code}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{new Date(invite.expires_at).toLocaleDateString()}</td>
                          <td className="py-3">{invite.accepted_at ? 'Accepted' : 'Ready'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="mt-6" eyebrow="Portal users" title="Assign client and pharmacist">
              <form onSubmit={saveAssignment} className="space-y-4">
                <div>
                  <label htmlFor="assignment-user" className="mb-2 block text-sm font-medium">Account</label>
                  <select
                    id="assignment-user"
                    value={selectedUserId}
                    onChange={(event) => { const next = users.find((user) => user.id === event.target.value); if (next) selectUser(next) }}
                    className={field}
                  >
                    <option value="">Select a portal user</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} — {user.email}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="assignment-home" className="mb-2 block text-sm font-medium">Client (home scope)</label>
                    <select id="assignment-home" value={homeId} onChange={(event) => { const next = homes.find((home) => home.id === event.target.value); setHomeId(event.target.value); setHomeName(next?.name ?? '') }} className={field}>
                      <option value="">Unassigned</option>
                      {homes.map((home) => (
                        <option key={home.id} value={home.id}>{home.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="assigned-pharmacist" className="mb-2 block text-sm font-medium">Assigned pharmacist</label>
                    <input id="assigned-pharmacist" value={assignedPharmacist} onChange={(event) => setAssignedPharmacist(event.target.value)} placeholder="Dr. Priya Raman, RPh" className={field} />
                  </div>
                </div>
                <button type="submit" disabled={busy} className="h-11 bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50">Save assignment</button>
              </form>
            </Card>
          </section>

          <section id="conversations">
            <Card eyebrow="Conversations" title="Live chat with nursing homes">
              <ThreadConsole />
            </Card>
          </section>

          <section id="data">
            <Card eyebrow="Data manager" title="Upload and manage scoped data">
              <DataManager homes={homes} pharmacies={pharmacies} />
            </Card>
          </section>
        </div>
      </main>
    </div>
  )
}
