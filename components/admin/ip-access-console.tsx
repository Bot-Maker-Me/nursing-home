'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useToast } from '@/components/common/toast'
import { Card } from '@/components/portal/page-header'
import { cn } from '@/lib/utils'

/**
 * Security › IP access — the admin console for the per-user / per-pharmacy allowlist.
 *
 * This component only ever talks to /api/admin/ip-access*, which verifies the admin role
 * server-side. It never decides an access verdict and never reads an IP from the browser:
 * the "Add my current IP" value comes from the server's own header resolution.
 */
type Mode = 'off' | 'log_only' | 'enforce'

type PortalUser = {
  id: string
  name: string
  email: string
  role: string
  mode: Mode
  failClosed: boolean
  pharmacyId: string | null
  pharmacyName: string
}

type Pharmacy = { id: string; name: string; mode: Mode }

type Rule = {
  id: string
  scope: 'user' | 'pharmacy'
  targetId: string
  targetName: string
  cidr: string
  label: string
  createdAt: string
}

type LogRow = {
  id: number
  user_id: string | null
  ip: string
  allowed: boolean
  mode: string
  matched_rule: string
  source: string
  path: string
  user_agent: string | null
  created_at: string
}

const MODE_OPTIONS: Array<{ value: Mode; label: string; help: string }> = [
  { value: 'off', label: 'Off', help: 'Nothing is checked. This account signs in from anywhere, as today.' },
  { value: 'log_only', label: 'Log only', help: 'Every decision is recorded in the audit below. Nobody is ever blocked.' },
  { value: 'enforce', label: 'Enforce', help: 'Sign-ins from an IP that matches no rule are blocked at the server.' },
]

const field =
  'h-11 w-full border border-hairline bg-cream px-3 text-sm focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20'

function targetKey(scope: 'user' | 'pharmacy', id: string) {
  return `${scope === 'user' ? 'u' : 'p'}:${id}`
}

function ruleCountLabel(count: number) {
  return `${count} IP${count === 1 ? '' : 's'}`
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'That request failed.')
  return data
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function IpAccessConsole() {
  const toast = useToast()
  const [users, setUsers] = useState<PortalUser[]>([])
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [currentIp, setCurrentIp] = useState('')
  const [loading, setLoading] = useState(true)

  const [selection, setSelection] = useState('')
  const [draftMode, setDraftMode] = useState<Mode>('off')
  const [draftFailClosed, setDraftFailClosed] = useState(false)
  const [savingMode, setSavingMode] = useState(false)

  const [ruleCidr, setRuleCidr] = useState('')
  const [ruleLabel, setRuleLabel] = useState('')
  const [savingRule, setSavingRule] = useState(false)
  const [removingId, setRemovingId] = useState('')

  const [logRows, setLogRows] = useState<LogRow[]>([])
  const [logNames, setLogNames] = useState<Record<string, string>>({})
  const [logUser, setLogUser] = useState('')
  const [logVerdict, setLogVerdict] = useState('')
  const [logLimit, setLogLimit] = useState('50')
  const [logLoading, setLogLoading] = useState(true)

  const targets = useMemo(
    () => [
      ...users.map((user) => ({
        key: targetKey('user', user.id),
        scope: 'user' as const,
        id: user.id,
        name: user.name,
        mode: user.mode,
        failClosed: user.failClosed,
        isAdmin: user.role.toLowerCase() === 'admin',
        detail: user.pharmacyName ? `Pharmacy staff — ${user.pharmacyName}` : user.email,
      })),
      ...pharmacies.map((pharmacy) => ({
        key: targetKey('pharmacy', pharmacy.id),
        scope: 'pharmacy' as const,
        id: pharmacy.id,
        name: pharmacy.name,
        mode: pharmacy.mode,
        failClosed: false,
        isAdmin: false,
        detail: 'Pharmacy — applies to every account on it',
      })),
    ],
    [users, pharmacies],
  )

  const selected = useMemo(() => targets.find((target) => target.key === selection) ?? null, [targets, selection])

  const ruleCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const rule of rules) {
      const key = targetKey(rule.scope, rule.targetId)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [rules])

  const selectedRules = useMemo(
    () => (selected ? rules.filter((rule) => rule.scope === selected.scope && rule.targetId === selected.id) : []),
    [rules, selected],
  )

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/ip-access')
      .then(readJson)
      .then((data) => {
        if (cancelled) return
        setUsers(data.users ?? [])
        setPharmacies(data.pharmacies ?? [])
        setRules(data.rules ?? [])
        setCurrentIp(typeof data.currentIp === 'string' ? data.currentIp : '')
        setSelection((current) => {
          if (current) return current
          if (data.users?.[0]) return targetKey('user', data.users[0].id)
          if (data.pharmacies?.[0]) return targetKey('pharmacy', data.pharmacies[0].id)
          return ''
        })
      })
      .catch((error) => {
        if (!cancelled) toast.error(messageOf(error, 'The IP access settings could not be loaded.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  // Selecting a target — or saving a change to it — puts the saved values back in the form.
  useEffect(() => {
    if (!selected) return
    setDraftMode(selected.mode)
    setDraftFailClosed(selected.failClosed)
    setRuleCidr('')
    setRuleLabel('')
  }, [selected])

  const loadLog = useCallback(async () => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams({ limit: logLimit })
      if (logUser) params.set('userId', logUser)
      if (logVerdict) params.set('verdict', logVerdict)
      const data = await readJson(await fetch(`/api/admin/ip-access/log?${params.toString()}`))
      setLogRows(data.rows ?? [])
      setLogNames(data.names ?? {})
    } finally {
      setLogLoading(false)
    }
  }, [logLimit, logUser, logVerdict])

  useEffect(() => {
    void loadLog().catch((error) => toast.error(messageOf(error, 'The access log could not be loaded.')))
  }, [loadLog, toast])

  const saveMode = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) {
      toast.error('Choose a user or a pharmacy first.')
      return
    }
    setSavingMode(true)
    try {
      const data = await readJson(
        await fetch('/api/admin/ip-access', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: selected.scope,
            targetId: selected.id,
            mode: draftMode,
            failClosed: draftFailClosed,
          }),
        }),
      )
      if (selected.scope === 'user') {
        setUsers((current) =>
          current.map((user) =>
            user.id === selected.id ? { ...user, mode: draftMode, failClosed: draftFailClosed } : user,
          ),
        )
      } else {
        setPharmacies((current) =>
          current.map((pharmacy) => (pharmacy.id === selected.id ? { ...pharmacy, mode: draftMode } : pharmacy)),
        )
      }
      const label = MODE_OPTIONS.find((option) => option.value === draftMode)?.label ?? draftMode
      if (typeof data.warning === 'string' && data.warning) toast.error(data.warning)
      else toast.success(`${selected.name} is now set to ${label.toLowerCase()}.`)
    } catch (error) {
      toast.error(messageOf(error, 'That mode could not be saved.'))
    } finally {
      setSavingMode(false)
    }
  }

  const addRuleValues = async (cidr: string, label: string) => {
    if (!selected) {
      toast.error('Choose a user or a pharmacy first.')
      return
    }
    setSavingRule(true)
    try {
      const data = await readJson(
        await fetch('/api/admin/ip-access', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scope: selected.scope, targetId: selected.id, cidr, label }),
        }),
      )
      const created: Rule = {
        id: data.rule.id,
        scope: selected.scope,
        targetId: selected.id,
        targetName: selected.name,
        cidr: data.rule.cidr,
        label: data.rule.label,
        createdAt: data.rule.createdAt,
      }
      setRules((current) => [...current, created])
      setRuleCidr('')
      setRuleLabel('')
      toast.success(`${created.cidr} is now allowed for ${selected.name}.`)
    } catch (error) {
      toast.error(messageOf(error, 'That IP address could not be added.'))
    } finally {
      setSavingRule(false)
    }
  }

  const removeRule = async (rule: Rule) => {
    setRemovingId(rule.id)
    try {
      await readJson(await fetch(`/api/admin/ip-access?id=${encodeURIComponent(rule.id)}`, { method: 'DELETE' }))
      setRules((current) => current.filter((candidate) => candidate.id !== rule.id))
      toast.success(`Removed ${rule.cidr}.`)
    } catch (error) {
      toast.error(messageOf(error, 'That IP address could not be removed.'))
    } finally {
      setRemovingId('')
    }
  }

  return (
    <div className="space-y-6">
      {loading && (
        <p role="status" className="flex items-center gap-2 border border-hairline bg-paper px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading IP access settings…
        </p>
      )}

      <Card eyebrow="Security · IP access" title="Who may sign in, and from where">
        <form onSubmit={saveMode} className="space-y-5">
          <div>
            <label htmlFor="ip-target" className="mb-2 block text-sm font-medium">
              User or pharmacy
            </label>
            <select id="ip-target" value={selection} onChange={(event) => setSelection(event.target.value)} className={field}>
              <option value="">Select a user or a pharmacy</option>
              <optgroup label="Portal users">
                {users.map((user) => (
                  <option key={user.id} value={targetKey('user', user.id)}>
                    {user.name}
                    {user.email ? ` — ${user.email}` : ''}
                    {user.role.toLowerCase() === 'admin' ? ' (admin)' : ''} ·{' '}
                    {ruleCountLabel(ruleCounts.get(targetKey('user', user.id)) ?? 0)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Pharmacies">
                {pharmacies.map((pharmacy) => (
                  <option key={pharmacy.id} value={targetKey('pharmacy', pharmacy.id)}>
                    {pharmacy.name} · {ruleCountLabel(ruleCounts.get(targetKey('pharmacy', pharmacy.id)) ?? 0)}
                  </option>
                ))}
              </optgroup>
            </select>
            {selected?.detail && <p className="mt-2 text-xs text-muted-foreground">{selected.detail}</p>}
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium">Mode</span>
            <div className="flex gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDraftMode(option.value)}
                  aria-pressed={draftMode === option.value}
                  className={cn(
                    'h-11 flex-1 border text-sm font-medium',
                    draftMode === option.value
                      ? 'border-forest bg-forest text-cream'
                      : 'border-hairline text-muted-foreground hover:bg-cream',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {MODE_OPTIONS.find((option) => option.value === draftMode)?.help}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Pharmacy accounts use the stricter of their own mode and their pharmacy&rsquo;s.
            </p>
          </div>

          {selected?.scope === 'user' && (
            <label className="flex items-start gap-3 border border-hairline bg-cream p-4 text-sm">
              <input
                type="checkbox"
                checked={draftFailClosed}
                onChange={(event) => setDraftFailClosed(event.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                Block this account when its allowlist is empty
                <span className="mt-1 block text-xs text-muted-foreground">
                  Off by default, and deliberately separate from the mode: while an allowlist is empty nobody is
                  blocked, so switching this account to Enforce before adding addresses can never lock anyone out.
                </span>
              </span>
            </label>
          )}

          {selected?.isAdmin && (
            <p className="flex items-start gap-2 border border-terracotta/40 bg-[var(--danger-bg)] px-4 py-3 text-xs text-terracotta">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Administrators are never restricted, so these settings will not block this account. They still apply to
              everyone the rules cover.
            </p>
          )}

          <button
            type="submit"
            disabled={savingMode || !selected}
            className="inline-flex h-11 items-center gap-2 bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50"
          >
            {savingMode && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Save mode
          </button>
        </form>
      </Card>

      <Card
        eyebrow="Allowlist"
        title={selected ? `Allowed IP addresses — ${selected.name}` : 'Allowed IP addresses'}
        meta={selected ? `${selectedRules.length} rule${selectedRules.length === 1 ? '' : 's'}` : undefined}
      >
        {!selected ? (
          <p className="text-sm text-muted-foreground">Choose a user or a pharmacy above to manage its addresses.</p>
        ) : (
          <>
            <ul className="divide-y divide-hairline border-y border-hairline text-sm">
              {selectedRules.length === 0 && (
                <li className="py-3 text-muted-foreground">
                  No IP addresses are allowed yet. An empty allowlist blocks nobody.
                </li>
              )}
              {selectedRules.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="min-w-0 truncate">
                    <span className="font-mono font-medium">{rule.cidr}</span>
                    {rule.label && <span className="ml-2 text-muted-foreground">{rule.label}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeRule(rule)}
                    disabled={removingId === rule.id}
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-terracotta hover:underline disabled:opacity-50"
                  >
                    {removingId === rule.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    )}
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                void addRuleValues(ruleCidr, ruleLabel)
              }}
              className="mt-6 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_auto]">
                <div>
                  <label htmlFor="rule-cidr" className="mb-2 block text-sm font-medium">
                    IP address or range
                  </label>
                  <input
                    id="rule-cidr"
                    value={ruleCidr}
                    onChange={(event) => setRuleCidr(event.target.value)}
                    placeholder="203.0.113.7 or 203.0.113.0/24"
                    className={field}
                  />
                </div>
                <div>
                  <label htmlFor="rule-label" className="mb-2 block text-sm font-medium">
                    Label (optional)
                  </label>
                  <input
                    id="rule-label"
                    value={ruleLabel}
                    onChange={(event) => setRuleLabel(event.target.value)}
                    placeholder="Front desk"
                    className={field}
                  />
                </div>
                <div className="sm:pt-7">
                  <button
                    type="submit"
                    disabled={savingRule}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 bg-forest px-5 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50 sm:w-auto"
                  >
                    {savingRule ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="size-4" aria-hidden="true" />
                    )}
                    Add IP
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void addRuleValues(currentIp, ruleLabel || 'My current IP')}
                  disabled={!currentIp || currentIp === 'unknown' || savingRule}
                  className="h-9 border border-hairline px-3 text-xs font-medium text-muted-foreground hover:bg-cream disabled:opacity-50"
                >
                  Add my current IP ({currentIp || 'unknown'})
                </button>
                <span className="text-xs text-muted-foreground">
                  Read by the server from the request headers — never from the browser.
                </span>
              </div>
            </form>
          </>
        )}
      </Card>

      <Card
        eyebrow="Audit"
        title="Recent access decisions"
        meta={logLoading ? undefined : `${logRows.length} row${logRows.length === 1 ? '' : 's'}`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="log-user" className="mb-2 block text-sm font-medium">
              User
            </label>
            <select id="log-user" value={logUser} onChange={(event) => setLogUser(event.target.value)} className={field}>
              <option value="">Everyone</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] flex-1">
            <label htmlFor="log-verdict" className="mb-2 block text-sm font-medium">
              Decision
            </label>
            <select
              id="log-verdict"
              value={logVerdict}
              onChange={(event) => setLogVerdict(event.target.value)}
              className={field}
            >
              <option value="">Any</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Blocked</option>
            </select>
          </div>
          <div className="min-w-[8rem] flex-1">
            <label htmlFor="log-limit" className="mb-2 block text-sm font-medium">
              Rows
            </label>
            <select id="log-limit" value={logLimit} onChange={(event) => setLogLimit(event.target.value)} className={field}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() =>
              void loadLog().catch((error) => toast.error(messageOf(error, 'The access log could not be loaded.')))
            }
            className="inline-flex h-11 items-center gap-2 border border-hairline px-4 text-sm font-medium hover:bg-cream"
          >
            <RefreshCw className={cn('size-4', logLoading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        </div>

        {logRows.length === 0 ? (
          <p className="mt-6 flex items-start gap-2 border border-hairline bg-cream px-4 py-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Nothing recorded yet. Decisions appear here once the server-side check is running, and they are only written
            while a target is set to Log only or Enforce.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-y border-hairline text-left">
                  <th className="py-3 pr-4">When</th>
                  <th className="py-3 pr-4">User</th>
                  <th className="py-3 pr-4">IP</th>
                  <th className="py-3 pr-4">Decision</th>
                  <th className="py-3 pr-4">Mode</th>
                  <th className="py-3 pr-4">Reason</th>
                  <th className="py-3">Where</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {logRows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">{row.user_id ? logNames[row.user_id] ?? 'Portal user' : '—'}</td>
                    <td className="py-3 pr-4 font-mono">{row.ip || '—'}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          'status-pill inline-flex px-2 py-0.5 text-xs font-medium',
                          row.allowed ? 'status-delivered' : 'status-out',
                        )}
                      >
                        {row.allowed ? 'Allowed' : 'Blocked'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.mode || '—'}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.matched_rule || '—'}</td>
                    <td className="py-3 text-muted-foreground">
                      {row.source ? `${row.source}${row.path ? ` ${row.path}` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
