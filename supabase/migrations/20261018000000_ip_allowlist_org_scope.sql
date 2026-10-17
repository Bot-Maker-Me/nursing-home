-- Henderson's Portal — IP allowlist PHASE 1b: nursing-home scope + the shared-DB gate.
--
-- Additive and idempotent. Safe to run on the shared database (the Pharma Portal reads the
-- same public schema). Nothing here blocks anybody yet:
--   * the gate functions below are DEFINED but not attached to any policy — Phase 4 attaches
--     them, after you have watched Log-only mode record real decisions.

-- ============================================================
-- 1. A third target: the nursing home
-- ============================================================
-- A rule can now belong to a user, a nursing home, or a pharmacy. A nursing-home rule
-- applies to every account whose profile points at that home.
alter table public.ip_allowlist add column if not exists home_id uuid references public.homes (id) on delete cascade;

alter table public.ip_allowlist drop constraint if exists ip_allowlist_scope_check;
alter table public.ip_allowlist add constraint ip_allowlist_scope_check
  check (scope in ('user', 'home', 'pharmacy'));

alter table public.ip_allowlist drop constraint if exists ip_allowlist_scope_target;
alter table public.ip_allowlist add constraint ip_allowlist_scope_target check (
  (scope = 'user' and user_id is not null and home_id is null and pharmacy_id is null)
  or (scope = 'home' and home_id is not null and user_id is null and pharmacy_id is null)
  or (scope = 'pharmacy' and pharmacy_id is not null and user_id is null and home_id is null)
);

create unique index if not exists ip_allowlist_home_cidr_key
  on public.ip_allowlist (home_id, cidr) where scope = 'home';
create index if not exists ip_allowlist_home_idx on public.ip_allowlist (home_id) where scope = 'home';

-- ============================================================
-- 2. Modes and fail-closed for the two organisation targets
-- ============================================================
alter table public.homes add column if not exists ip_restriction_mode text not null default 'off';
alter table public.homes drop constraint if exists homes_ip_restriction_mode_check;
alter table public.homes add constraint homes_ip_restriction_mode_check
  check (ip_restriction_mode in ('off', 'log_only', 'enforce'));

-- Same explicit opt-in as on profiles: an empty allowlist never blocks unless this is on.
alter table public.homes add column if not exists ip_fail_closed boolean not null default false;
alter table public.pharmacies add column if not exists ip_fail_closed boolean not null default false;

-- ============================================================
-- 3. Matching: a user's own rules + their home's + their pharmacy's
-- ============================================================
create or replace function public.ip_is_allowed(p_user_id uuid, p_ip inet)
returns boolean
language sql
security definer
set search_path = public
stable as $$
  select exists (
    select 1
    from public.ip_allowlist a
    join public.profiles p on p.id = p_user_id
    where p_ip <<= a.cidr::inet
      and (
        (a.scope = 'user' and a.user_id = p.id)
        or (a.scope = 'home' and a.home_id is not null and a.home_id = p.home_id)
        or (a.scope = 'pharmacy' and a.pharmacy_id is not null and a.pharmacy_id = p.pharmacy_id)
      )
  );
$$;

-- Stricter of the profile's, its home's and its pharmacy's mode (off < log_only < enforce).
create or replace function public.ip_effective_mode(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable as $$
  select case
    when 'enforce' in (
      coalesce(p.ip_restriction_mode, 'off'),
      coalesce(h.ip_restriction_mode, 'off'),
      coalesce(ph.ip_restriction_mode, 'off')
    ) then 'enforce'
    when 'log_only' in (
      coalesce(p.ip_restriction_mode, 'off'),
      coalesce(h.ip_restriction_mode, 'off'),
      coalesce(ph.ip_restriction_mode, 'off')
    ) then 'log_only'
    else 'off'
  end
  from public.profiles p
  left join public.homes h on h.id = p.home_id
  left join public.pharmacies ph on ph.id = p.pharmacy_id
  where p.id = p_user_id;
$$;

create or replace function public.ip_fail_closed(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable as $$
  select coalesce(p.ip_fail_closed, false)
      or coalesce(h.ip_fail_closed, false)
      or coalesce(ph.ip_fail_closed, false)
  from public.profiles p
  left join public.homes h on h.id = p.home_id
  left join public.pharmacies ph on ph.id = p.pharmacy_id
  where p.id = p_user_id;
$$;

-- ============================================================
-- 4. The shared-database gate (Phase 4 attaches it to policies)
-- ============================================================
-- The client IP as the database can see it for the CURRENT request. PostgREST exposes the
-- request headers as `request.headers`; the address Supabase's edge saw is the RIGHTMOST
-- entry of x-forwarded-for, because the edge appends it — so anything a client prepends sits
-- to its left and can never be mistaken for the real address.
--
-- Returns NULL when nothing usable is present. Callers treat NULL as "cannot tell", never as
-- "not allowed": an unreadable header must not lock an organisation out of its data.
create or replace function public.ip_request_ip()
returns inet
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  headers jsonb;
  forwarded text;
  candidate text;
begin
  begin
    headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    return null;
  end;

  candidate := nullif(trim(coalesce(headers ->> 'x-real-ip', '')), '');

  if candidate is null then
    forwarded := coalesce(headers ->> 'x-forwarded-for', '');
    if forwarded <> '' then
      -- Last comma-separated entry = the address the trusted edge appended.
      candidate := nullif(trim(split_part(forwarded, ',', array_length(string_to_array(forwarded, ','), 1))), '');
    end if;
  end if;

  if candidate is null then
    return null;
  end if;

  -- "[2001:db8::1]:443" -> "2001:db8::1"
  if candidate like '[%' then
    candidate := split_part(substring(candidate from 2), ']', 1);
  end if;
  -- "203.0.113.7:51234" -> "203.0.113.7"
  if candidate ~ '^\d{1,3}(\.\d{1,3}){3}:\d+$' then
    candidate := split_part(candidate, ':', 1);
  end if;
  -- "::ffff:203.0.113.7" -> "203.0.113.7", so an IPv4 rule still matches a mapped client.
  if candidate ~* '^::ffff:\d{1,3}(\.\d{1,3}){3}$' then
    candidate := substring(candidate from 8);
  end if;

  begin
    return candidate::inet;
  exception when others then
    return null;
  end;
end;
$$;

-- THE predicate every policy in Phase 4 will use. True = the request may read/write.
--
-- Order matters:
--   1. no session (anon)            -> true (there is no account to restrict)
--   2. admin / platform admin       -> true (admins are never restricted)
--   3. mode 'off'                   -> true (nothing is being checked)
--   4. IP undeterminable            -> true (never lock people out over a missing header)
--   5. a rule matches               -> true
--   6. mode 'log_only'              -> true (recording only)
--   7. 'enforce' + empty allowlist   -> true unless that target opted into fail-closed
--   8. otherwise                    -> false
create or replace function public.ip_gate_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  ip inet;
  mode text;
  has_rules boolean;
begin
  if me is null then
    return true;
  end if;

  if public.is_ip_exempt_user(me) then
    return true;
  end if;

  mode := coalesce(public.ip_effective_mode(me), 'off');
  if mode = 'off' then
    return true;
  end if;

  ip := public.ip_request_ip();
  if ip is null then
    return true;
  end if;

  if public.ip_is_allowed(me, ip) then
    return true;
  end if;

  if mode = 'log_only' then
    return true;
  end if;

  select exists (
    select 1
    from public.ip_allowlist a
    join public.profiles p on p.id = me
    where (a.scope = 'user' and a.user_id = p.id)
       or (a.scope = 'home' and a.home_id is not null and a.home_id = p.home_id)
       or (a.scope = 'pharmacy' and a.pharmacy_id is not null and a.pharmacy_id = p.pharmacy_id)
  ) into has_rules;

  if not coalesce(has_rules, false) then
    return not coalesce(public.ip_fail_closed(me), false);
  end if;

  return false;
end;
$$;

grant execute on function public.ip_request_ip() to authenticated, service_role;
grant execute on function public.ip_gate_ok() to authenticated, service_role;
grant execute on function public.ip_fail_closed(uuid) to authenticated, service_role;

-- ============================================================
-- 5. Verify
-- ============================================================
-- Rules, by target kind:
select scope, count(*) as rules from public.ip_allowlist group by scope order by scope;

-- Modes: everything should still be 'off', so nothing is checked yet.
select 'profile' as target, full_name as name, ip_restriction_mode as mode, ip_fail_closed
from public.profiles
union all
select 'home', name, ip_restriction_mode, ip_fail_closed from public.homes
union all
select 'pharmacy', name, ip_restriction_mode, ip_fail_closed from public.pharmacies
order by target, name;

-- What the database can see of a request's headers (NULL in the SQL editor, which is
-- correct — there is no HTTP request here):
-- select public.ip_request_ip(), current_setting('request.headers', true);
