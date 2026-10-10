'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { ArrowRight, Check, Eye, EyeOff, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient, supabasePublishableKey, supabaseUrl } from '@/lib/supabase/client'

type Mode = 'signin' | 'activate'
type Step = 'credentials' | 'mfa' | 'ready'

const inputClass =
  'h-12 w-full border border-hairline bg-cream px-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20'

function Field({
  id,
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <input id={id} name={id} className={inputClass} {...props} />
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  visible: boolean
  onToggle: () => void
  autoComplete: string
}) {
  return (
    <div className="relative">
      <Field
        id={id}
        label={label}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        onClick={onToggle}
        className="absolute right-3 bottom-3 text-muted-foreground hover:text-forest"
      >
        {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  )
}

const passwordRules = [{ test: (p: string) => p.length >= 8, label: '8+ characters' }]

function MfaInput({ onComplete }: { onComplete: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const update = (i: number, value: string) => {
    const v = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = v
    setDigits(next)
    if (v && i < 5) refs.current[i + 1]?.focus()
  }

  const complete = digits.every(Boolean)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (complete) onComplete()
      }}
    >
      <fieldset>
        <legend className="text-sm font-medium">6-digit code from your authenticator app</legend>
        <div className="mt-3 grid grid-cols-6 gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              value={d}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
              }}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${i + 1}`}
              className="h-14 w-full border border-hairline bg-cream text-center font-mono text-2xl focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
            />
          ))}
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={!complete}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 bg-forest font-semibold text-cream hover:bg-forest-deep disabled:opacity-40"
      >
        Verify and continue
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </form>
  )
}

function QrPlaceholder() {
  const cells = '1110111010011101101010111001101011100101110100111011010101110011010111001011101'
  return (
    <div className="grid size-28 shrink-0 grid-cols-9 gap-px border border-hairline bg-cream p-2" aria-hidden="true">
      {cells.split('').map((c, i) => (
        <span key={i} className={c === '1' ? 'bg-forest' : 'bg-transparent'} />
      ))}
    </div>
  )
}

function AccountReady({ name }: { name: string }) {
  const firstName = name.trim().split(' ')[0] || 'there'
  const access = [
    ['Home', 'Maple Grove LTC · Wing B'],
    ['Role', 'Charge nurse'],
    ['Permissions', 'Messages, deliveries, cut-offs, policies'],
    ['Session', 'Signs out after 10 min idle'],
  ]
  return (
    <div className="mt-8" role="status">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center bg-forest text-cream">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <p className="eyebrow text-forest/70">Invitation activated</p>
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em]">{`You're in, ${firstName}.`}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your account is linked to your home. Here is what you have access to.
      </p>
      <dl className="mt-6 divide-y divide-hairline border-y border-hairline">
        {access.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="eyebrow text-muted-foreground">{k}</dt>
            <dd className="text-right text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/portal"
          className="inline-flex h-12 flex-1 items-center justify-center gap-3 bg-forest px-5 font-semibold text-cream hover:bg-forest-deep"
        >
          Enter home portal
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>

      </div>
    </div>
  )
}

export function AuthTicket({ initialMode, redirectTo = '/portal' }: { initialMode: Mode; redirectTo?: '/admin' | '/portal' }) {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [signinPassword, setSigninPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showSigninPassword, setShowSigninPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const switchMode = (m: Mode) => {
    setMode(m)
    setStep('credentials')
  }

  const rulesMet = passwordRules.every((r) => r.test(password)) && password === confirm

  const onMfaComplete = () => {
    if (mode === 'signin') router.push('/portal')
    else setStep('ready')
  }

  return (
    <div className="w-full max-w-4xl">
      <div className="mb-4 flex flex-col gap-3 border border-white/15 bg-white/5 px-4 py-3 text-sm text-cream/80 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-terracotta" aria-hidden="true" />
          Secure access for authorized Henderson&apos;s Pharmacy partners.
        </p>
        <p className="text-xs text-cream/60">Your account is protected by Supabase Auth.</p>
      </div>

      <div className="grid w-full border border-white/10 bg-paper shadow-[18px_18px_0_0_rgba(0,0,0,0.25)] md:grid-cols-[15rem_1fr]">
        <aside className="relative flex flex-col justify-between gap-8 border-b border-dashed border-hairline bg-mint p-6 md:border-r md:border-b-0">
          <div>
            <p className="eyebrow text-forest/70">Access pass</p>
            <p className="mt-3 text-3xl font-bold leading-none tracking-[-0.04em] text-forest">
              {mode === 'signin' ? 'Station sign-in' : 'New account'}
            </p>
          </div>
          {mode === 'activate' && (
            <ol className="space-y-2 text-sm text-forest" aria-label="Activation steps">
              {(
                [
                  ['credentials', 'Invitation & password'],
                  ['mfa', 'Authenticator'],
                  ['ready', 'Account ready'],
                ] as const
              ).map(([s, label], i) => {
                const order = ['credentials', 'mfa', 'ready']
                const done = order.indexOf(step) > i
                const current = step === s
                return (
                  <li key={s} className={cn('flex items-center gap-2', !done && !current && 'opacity-50')}>
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center border border-forest font-mono text-[10px]',
                        (done || current) && 'bg-forest text-cream',
                      )}
                    >
                      {done ? <Check className="size-3" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className={cn(current && 'font-semibold')}>{label}</span>
                    {current && <span className="sr-only">(current step)</span>}
                  </li>
                )
              })}
            </ol>
          )}
          <dl className="space-y-4 text-sm text-forest">
            <div>
              <dt className="eyebrow text-forest/60">Session</dt>
              <dd className="mt-1 font-mono">Idle logout · 10 min</dd>
            </div>
            <div>
              <dt className="eyebrow text-forest/60">Verification</dt>
              <dd className="mt-1 font-mono">MFA required</dd>
            </div>
          </dl>
          <div className="hidden h-12 gap-[3px] md:flex" aria-hidden="true">
            {'1101001011101001101101001011'.split('').map((b, i) => (
              <span key={i} className={cn('h-full bg-forest', b === '1' ? 'w-[3px]' : 'w-px opacity-50')} />
            ))}
          </div>
        </aside>

        <div className="p-6 sm:p-10">
          {step !== 'ready' && (
            <div role="tablist" aria-label="Account access" className="grid grid-cols-2 border border-hairline">
              {(
                [
                  ['signin', 'Sign in'],
                  ['activate', 'Activate invitation'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    'h-11 text-sm font-medium transition-colors',
                    mode === m ? 'bg-forest text-cream' : 'text-muted-foreground hover:text-forest',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {error && <p role="alert" className="mt-5 border border-terracotta/40 bg-terracotta/5 px-4 py-3 text-sm text-terracotta">{error}</p>}

          {step === 'credentials' && mode === 'signin' && (
            <form
              className="mt-8 space-y-5"
              onSubmit={async (e) => {
                e.preventDefault()
                setError(null)
                const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
                  method: 'POST',
                  headers: { apikey: supabasePublishableKey, 'content-type': 'application/json' },
                  body: JSON.stringify({ email: email.trim().toLowerCase(), password: signinPassword }),
                })
                const result = await response.json().catch(() => null)
                if (!response.ok || !result?.access_token || !result?.refresh_token) {
                  setError(response.status === 400 ? 'Invalid email or password. Check both fields and try again.' : 'Unable to reach Supabase Auth. Please reload and try again.')
                  return
                }
                const sessionResponse = await fetch('/api/auth/sign-in', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ access_token: result.access_token, refresh_token: result.refresh_token }),
                })
                const sessionResult = await sessionResponse.json().catch(() => null)
                if (!sessionResponse.ok) {
                  setError(sessionResult?.error ?? 'Unable to establish a secure session. Please reload and try again.')
                  return
                }
                router.push(redirectTo === '/admin' ? '/admin' : sessionResult.redirect)
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-bold tracking-[-0.03em]">Welcome back.</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Use the work email your home registered.</p>
                </div>
              </div>
              <Field
                id="email"
                label="Work email"
                type="email"
                autoComplete="username"
                required
                placeholder="name@yourhome.ca"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <PasswordField
                id="password"
                label="Password"
                autoComplete="current-password"
                value={signinPassword}
                onChange={(e) => setSigninPassword(e.target.value)}
                visible={showSigninPassword}
                onToggle={() => setShowSigninPassword((visible) => !visible)}
              />
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input type="checkbox" name="shared" defaultChecked className="size-4 accent-forest" />
                  This is a shared station
                </label>
                <span className="text-forest underline underline-offset-4">Forgot password?</span>
              </div>
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-3 bg-forest font-semibold text-cream hover:bg-forest-deep"
              >
                Continue
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </form>
          )}

          {step === 'credentials' && mode === 'activate' && (
            <form
              className="mt-8 space-y-5"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!rulesMet) return
                setError(null)
                if (!email.trim() || !name.trim()) {
                  setError('Enter your work email and full name to continue.')
                  return
                }
                const invitationCheck = await fetch('/api/auth/invitation', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ code: invite, email }),
                })
                const invitationData = await invitationCheck.json()
                if (!invitationCheck.ok) {
                  setError(invitationData.error ?? 'That invitation code is not valid.')
                  return
                }
                const normalizedEmail = email.trim().toLowerCase()
                const { data: signUpData, error: authError } = await supabase.auth.signUp({
                  email: normalizedEmail,
                  password,
                  options: {
                    emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
                    data: { full_name: name.trim(), invitation_code: invite.trim().toUpperCase() },
                  },
                })
                if (authError) {
                  const message = authError.message.toLowerCase()
                  if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
                    setError('This email is already registered. Use Sign in instead.')
                  } else if (message.includes('password') || message.includes('weak')) {
                    setError('Choose a password with at least 8 characters.')
                  } else if (message.includes('rate') || message.includes('too many')) {
                    setError('Too many attempts. Please wait a few minutes and try again.')
                  } else if (message.includes('not authorized') || message.includes('email_address_not_authorized')) {
                    setError('This Supabase project only allows approved email addresses. Ask the administrator to allow this email or use the project email provider.')
                  } else if (message.includes('invalid') && message.includes('email')) {
                    setError('Enter a valid work email address.')
                  } else {
                    setError('Account creation failed. Please verify the invitation email matches this account and try again.')
                  }
                  return
                }
                if (signUpData.user) {
                  const linkResponse = await fetch('/api/auth/invitation', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ code: invite, email, userId: signUpData.user.id, fullName: name }),
                  })
                  if (!linkResponse.ok) {
                    setError('Account created, but your invitation could not be linked. Please contact the pharmacy.')
                    return
                  }
                }
                setStep('mfa')
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-bold tracking-[-0.03em]">Claim your seat.</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter the code from your invitation email. Invitations expire after 72 hours.
                  </p>
                </div>
              </div>
              <Field
                id="invite"
                label="Invitation code"
                hint="e.g. HM42-7KQ9-PX"
                required
                autoComplete="off"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                className={cn(inputClass, 'font-mono uppercase tracking-widest')}
              />
              <Field
                id="email"
                label="Work email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@yourhome.ca"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Field
                id="name"
                label="Full name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <PasswordField
                  id="new-password"
                  label="Create password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  visible={showPassword}
                  onToggle={() => setShowPassword((visible) => !visible)}
                />
                <PasswordField
                  id="confirm-password"
                  label="Confirm"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  visible={showConfirm}
                  onToggle={() => setShowConfirm((visible) => !visible)}
                />
              </div>
              <ul className="grid grid-cols-2 gap-2 text-xs" aria-label="Password requirements">
                {[
                  ...passwordRules,
                  { test: () => password.length > 0 && password === confirm, label: 'Passwords match' },
                ].map((r) => {
                  const ok = r.test(password)
                  return (
                    <li
                      key={r.label}
                      className={cn('flex items-center gap-2', ok ? 'text-forest' : 'text-muted-foreground')}
                    >
                      {ok ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
                      {r.label}
                      <span className="sr-only">{ok ? 'met' : 'not met'}</span>
                    </li>
                  )
                })}
              </ul>
              <button
                type="submit"
                disabled={!rulesMet}
                className="inline-flex h-12 w-full items-center justify-center gap-3 bg-forest font-semibold text-cream hover:bg-forest-deep disabled:opacity-40"
              >
                Next: set up MFA
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </form>
          )}

          {step === 'mfa' && (
            <div className="mt-8">
              <h1 className="text-3xl font-bold tracking-[-0.03em]">
                {mode === 'activate' ? 'Link your authenticator.' : 'One more check.'}
              </h1>
              <p className="mt-1 mb-6 text-sm text-muted-foreground">
                {mode === 'activate'
                  ? 'Scan this code with Google Authenticator, Microsoft Authenticator, or 1Password, then enter the 6 digits it shows.'
                  : 'Every account uses multi-factor sign-in.'}
              </p>
              {mode === 'activate' && (
                <div className="mb-6 flex items-center gap-5 border border-hairline bg-cream/60 p-4">
                  <QrPlaceholder />
                  <div className="min-w-0 text-sm">
                    <p className="eyebrow text-muted-foreground">{"Can't scan?"}</p>
                    <p className="mt-1">Enter this setup key manually:</p>
                    <p className="mt-2 break-all font-mono text-xs tracking-widest text-forest">JBSW Y3DP EHPK 3PXP</p>
                  </div>
                </div>
              )}
              <MfaInput onComplete={onMfaComplete} />
              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
              >
                Back
              </button>
            </div>
          )}

          {step === 'ready' && <AccountReady name={name} />}

          <p className="mt-8 border-t border-hairline pt-5 text-xs leading-relaxed text-muted-foreground">
            Authorized users only. Activity is recorded in an audit log. Locked out? Call{' '}
            <a href="tel:9055550199" className="font-mono text-forest underline underline-offset-4">
              905-555-0199
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
