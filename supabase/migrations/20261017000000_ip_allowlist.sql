-- Henderson's Portal — per-user / per-pharmacy IP allowlist (PHASE 1: data only).
--
-- Run this in the connected Supabase project's SQL editor. It is ADDITIVE and IDEMPOTENT
-- (every statement is guarded), because this database is SHARED with the Pharma Portal —
-- nothing here drops or rewrites an existing table, policy or column.
--
-- Nothing is enforced by this file on its own: modes default to 'off' for every profile and
-- pharmacy, so applying it changes no behaviour until an admin opts someone in.
--
-- What it adds
--   1. public.ip_allowlist     — the rules (single IPs and ranges, IPv4 + IPv6)
--   2. profiles/pharmacies.ip_restriction_mode + profiles.ip_fail_closed
--   3. public.ip_access_log    — append-only audit trail
--   4. RLS + grants            — only admins (and the service role) can touch either table
--   5. matching helpers        — ip_is_allowed / ip_effective_mode / is_ip_exempt_user
--
-- The rules are matched with Postgres' native `cidr` type rather than text, so a bare
-- address is normalised on write ('203.0.113.7' -> '203.0.113.7/32') and containment is an
-- indexed operator (`ip <<= cidr`) instead of string parsing in the app.

-- ============================================================
-- 1. Rules
-- ============================================================
create table if not exists public.ip_allowlist (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('user', 'pharmacy')),
  user_id uuid references auth.users (id) on delete cascade,
  pharmacy_id uuid references public.pharmacies (id) on delete cascade,
  -- Single IP or range, IPv4 or IPv6. The `cidr` type validates and normalises it, so a
  -- malformed value is rejected here instead of silently never matching.
  cidr cidr not null,
  label text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Exactly one target: a user rule has no pharmacy and a pharmacy rule has no user.
  constraint ip_allowlist_scope_target check (
    (scope = 'user' and user_id is not null and pharmacy_id is null)
    or (scope = 'pharmacy' and pharmacy_id is not null and user_id is null)
  )
);

-- No duplicate rules per target (re-adding the same office IP is a no-op, not a second row).
create unique index if not exists ip_allowlist_user_cidr_key
  on public.ip_allowlist (user_id, cidr) where scope = 'user';
create unique index if not exists ip_allowlist_pharmacy_cidr_key
  on public.ip_allowlist (pharmacy_id, cidr) where scope = 'pharmacy';
create index if not exists ip_allowlist_user_idx on public.ip_allowlist (user_id) where scope = 'user';
create index if not exists ip_allowlist_pharmacy_idx on public.ip_allowlist (pharmacy_id) where scope = 'pharmacy';

-- ============================================================
-- 2. Modes
-- ============================================================
-- 'off'      — no evaluation at all (default, so nothing changes on apply)
-- 'log_only' — evaluate and record every decision, never block
-- 'enforce'  — block users from IPs that no rule matches
alter table public.profiles add column if not exists ip_restriction_mode text not null default 'off';
alter table public.profiles drop constraint if exists profiles_ip_restriction_mode_check;
alter table public.profiles add constraint profiles_ip_restriction_mode_check
  check (ip_restriction_mode in ('off', 'log_only', 'enforce'));

-- Per-pharmacy mode: inherited by that pharmacy's staff. The effective mode is the
-- STRICTER of the profile's own mode and its pharmacy's, so a pharmacy can protect all of
-- its accounts at once while a single user can still be raised (never lowered) on their own.
alter table public.pharmacies add column if not exists ip_restriction_mode text not null default 'off';
alter table public.pharmacies drop constraint if exists pharmacies_ip_restriction_mode_check;
alter table public.pharmacies add constraint pharmacies_ip_restriction_mode_check
  check (ip_restriction_mode in ('off', 'log_only', 'enforce'));

-- Safety net: an 'enforce' user with NO rules is allowed through by default (fail open), so
-- switching someone to 'enforce' before their rules are in place can never lock the
-- organisation out. Blocking an empty allowlist is an explicit, separate opt-in per user.
alter table public.profiles add column if not exists ip_fail_closed boolean not null default false;

-- ============================================================
-- 3. Access log (append-only)
-- ============================================================
create table if not exists public.ip_access_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  -- Text, not inet: an unresolved client ("unknown") must be recordable.
  ip text not null default '',
  allowed boolean not null,
  mode text not null default '',
  -- Which rule matched (label or cidr) / why the request was denied. Never shown to users.
  matched_rule text not null default '',
  -- Where the check ran: 'login', 'page', 'api' or 'db'.
  source text not null default '',
  path text not null default '',
  user_agent text,
  -- Diagnostics only (the verbatim x-forwarded-for / x-real-ip this deployment received),
  -- kept so the trusted header position can be confirmed with evidence before enforcing.
  -- Deliberately excludes cookies and authorization headers. Safe to drop later.
  request_headers jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ip_access_log_created_idx on public.ip_access_log (created_at desc);
create index if not exists ip_access_log_user_idx on public.ip_access_log (user_id, created_at desc);
create index if not exists ip_access_log_denied_idx on public.ip_access_log (created_at desc) where not allowed;

-- ============================================================
-- 4. Row Level Security + grants
-- ============================================================
alter table public.ip_allowlist enable row level security;

-- Whole-table admin access. `public.is_admin()` already exists (profiles.role = 'admin').
drop policy if exists "Admins manage ip allowlist" on public.ip_allowlist;
create policy "Admins manage ip allowlist" on public.ip_allowlist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.ip_access_log enable row level security;

-- Admins read and append; there is deliberately NO update or delete policy (and no
-- update/delete grant) below, so even an admin cannot rewrite the audit trail.
drop policy if exists "Admins read ip access log" on public.ip_access_log;
create policy "Admins read ip access log" on public.ip_access_log for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins append ip access log" on public.ip_access_log;
create policy "Admins append ip access log" on public.ip_access_log for insert to authenticated
  with check (public.is_admin());

grant select, insert, update, delete on public.ip_allowlist to authenticated;
grant select, insert on public.ip_access_log to authenticated;
grant all on public.ip_allowlist to service_role;
grant all on public.ip_access_log to service_role;

-- NOTE: because the log's insert policy is admin-only, the server-side guard (Phases 3/4)
-- writes log rows with the existing service-role client (lib/supabase/admin.ts) — server
-- code only, exactly like app/api/admin/*. SUPABASE_SERVICE_ROLE_KEY must therefore be set
-- for logging to work; without it the guard still evaluates and blocks correctly but has
-- nowhere to record the decision.

-- ============================================================
-- 5. Matching helpers (pure data logic — used by Phases 3 and 4)
-- ============================================================
-- Is this IP covered by p_user_id's own rules, or by their pharmacy's rules?
create or replace function public.ip_is_allowed(p_user_id uuid, p_ip inet)
returns boolean
language sql
security definer
set search_path = public
stable as $$
  select
    exists (
      select 1 from public.ip_allowlist a
      where a.scope = 'user' and a.user_id = p_user_id and p_ip <<= a.cidr
    )
    or exists (
      select 1 from public.ip_allowlist a
      join public.profiles p on p.pharmacy_id = a.pharmacy_id
      where a.scope = 'pharmacy' and p.id = p_user_id and p_ip <<= a.cidr
    );
$$;

-- The stricter of the profile's own mode and its pharmacy's (off < log_only < enforce).
-- Returns null when p_user_id has no profile row; callers treat that as 'off'.
create or replace function public.ip_effective_mode(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable as $$
  select case
    when coalesce(p.ip_restriction_mode, 'off') = 'enforce'
      or coalesce(ph.ip_restriction_mode, 'off') = 'enforce' then 'enforce'
    when coalesce(p.ip_restriction_mode, 'off') = 'log_only'
      or coalesce(ph.ip_restriction_mode, 'off') = 'log_only' then 'log_only'
    else 'off'
  end
  from public.profiles p
  left join public.pharmacies ph on ph.id = p.pharmacy_id
  where p.id = p_user_id;
$$;

-- Admins are never restricted. Two sources:
--   1. profiles.role = 'admin' (this app's own definition, via is_admin())
--   2. public.platform_admins — a table owned by the SHARED Pharma Portal database, not by
--      this repo. It is consulted only when it exists and only via a `user_id` column;
--      anything unexpected (table or column missing, different shape) is treated as
--      "not a platform admin" rather than raising, so this migration cannot fail on a
--      database where that table does not look the way it does here.
create or replace function public.is_ip_exempt_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable as $$
declare
  exempt boolean;
begin
  select lower(coalesce(p.role, '')) = 'admin' into exempt
  from public.profiles p where p.id = p_user_id;
  if coalesce(exempt, false) then return true; end if;

  begin
    if to_regclass('public.platform_admins') is not null then
      execute 'select exists (select 1 from public.platform_admins where user_id = $1)'
        into exempt using p_user_id;
      return coalesce(exempt, false);
    end if;
  exception when others then
    return false;
  end;

  return false;
end;
$$;

grant execute on function public.ip_is_allowed(uuid, inet) to authenticated, service_role;
grant execute on function public.ip_effective_mode(uuid) to authenticated, service_role;
grant execute on function public.is_ip_exempt_user(uuid) to authenticated, service_role;

-- ============================================================
-- 6. Verify (these SELECTs are read-only sanity checks)
-- ============================================================
-- Every account should read mode 'off' for now:
select id, full_name, role, ip_restriction_mode, ip_fail_closed, pharmacy_id
from public.profiles order by role, full_name;

-- Matching engine smoke test (returns false while there are no rules, which is correct):
-- select public.ip_effective_mode((select id from public.profiles limit 1)) as mode,
--        public.ip_is_allowed((select id from public.profiles limit 1), '203.0.113.7') as allowed;

-- ============================================================
-- 7. Rollback (only if you ever need to undo Phase 1 — enforces nothing before that)
-- ============================================================
-- drop function if exists public.is_ip_exempt_user(uuid);
-- drop function if exists public.ip_effective_mode(uuid);
-- drop function if exists public.ip_is_allowed(uuid, inet);
-- drop table if exists public.ip_access_log;
-- drop table if exists public.ip_allowlist;
-- alter table public.profiles drop column if exists ip_fail_closed;
-- alter table public.profiles drop column if exists ip_restriction_mode;
-- alter table public.pharmacies drop column if exists ip_restriction_mode;
