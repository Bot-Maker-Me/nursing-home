-- Henderson's Portal — IP allowlist PHASE 3: evaluation + audit (log-only).
--
-- Additive and idempotent. Nothing here blocks anybody: the gate predicate stays UNATTACHED
-- to every policy until Phase 4, and the app only records what it finds.
--
-- One entry point, public.ip_guard(), evaluates a decision AND records it in a single round
-- trip. It is callable by service_role only, so a signed-in user can never write (or
-- discover) audit rows, and the IP it is given is the one the app resolved from the proxy
-- headers — never a value the browser chose.

-- ============================================================
-- 1. Audit columns
-- ============================================================
-- `allowed` is what actually happened under the current mode; `would_block` is what
-- enforcement would do to this request. Keeping both means Log-only mode shows the future
-- decision without ever being able to block anyone.
alter table public.ip_access_log add column if not exists would_block boolean not null default false;

-- Backs the de-duplication lookup below (one "allowed" row per user+IP per hour).
create index if not exists ip_access_log_dedupe_idx
  on public.ip_access_log (user_id, ip, created_at desc) where allowed;

-- ============================================================
-- 2. One shared IP normaliser
-- ============================================================
-- "[2001:db8::1]:443", "203.0.113.7:51234" and "::ffff:203.0.113.7" all collapse to a plain
-- address, so an IPv4 rule also matches a client the edge reported in mapped form.
-- NULL means "cannot tell", which callers must never treat as "not allowed".
create or replace function public.ip_parse(p_text text)
returns inet
language plpgsql
immutable
as $$
declare
  candidate text := nullif(trim(coalesce(p_text, '')), '');
begin
  if candidate is null then
    return null;
  end if;

  if candidate like '[%' then
    candidate := split_part(substring(candidate from 2), ']', 1);
  end if;
  if candidate ~ '^\d{1,3}(\.\d{1,3}){3}:\d+$' then
    candidate := split_part(candidate, ':', 1);
  end if;
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

-- The IP of the CURRENT database request. PostgREST exposes the request headers, and the
-- address the trusted edge saw is the RIGHTMOST entry of x-forwarded-for because the edge
-- appends it — anything a client prepends sits to its left and can never be mistaken for it.
-- Declared in plpgsql purely so the header parse can never RAISE: this function is called
-- from RLS policies in Phase 4, where an exception would turn every query into a 500.
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

  return public.ip_parse(candidate);
end;
$$;

-- ============================================================
-- 3. The decision, computed once and reused everywhere
-- ============================================================
create or replace function public.ip_has_rules(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ip_allowlist a
    join public.profiles p on p.id = p_user_id
    where (a.scope = 'user' and a.user_id = p.id)
       or (a.scope = 'home' and a.home_id is not null and a.home_id = p.home_id)
       or (a.scope = 'pharmacy' and a.pharmacy_id is not null and a.pharmacy_id = p.pharmacy_id)
  );
$$;

-- Which rule let this IP through — its label when it has one, otherwise the range itself.
-- The most specific scope wins, so a per-user exception is reported over the home's rule.
create or replace function public.ip_matched_rule(p_user_id uuid, p_ip inet)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(a.label, ''), a.cidr::text)
  from public.ip_allowlist a
  join public.profiles p on p.id = p_user_id
  where p_ip is not null
    and p_ip <<= a.cidr::inet
    and (
      (a.scope = 'user' and a.user_id = p.id)
      or (a.scope = 'home' and a.home_id is not null and a.home_id = p.home_id)
      or (a.scope = 'pharmacy' and a.pharmacy_id is not null and a.pharmacy_id = p.pharmacy_id)
    )
  order by case a.scope when 'user' then 0 when 'home' then 1 else 2 end, a.cidr
  limit 1;
$$;

-- Would enforcement block this request? Deliberately mode-independent, so it is a usable
-- preview while a target is still in Log-only mode.
--
-- False for: an admin, an unreadable IP, a matching rule, and — unless that target opted in
-- to fail-closed — an empty allowlist.
create or replace function public.ip_would_block_for(p_user_id uuid, p_ip inet)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_ip is null then
    return false;
  end if;
  if public.is_ip_exempt_user(p_user_id) then
    return false;
  end if;
  if public.ip_is_allowed(p_user_id, p_ip) then
    return false;
  end if;
  if public.ip_has_rules(p_user_id) then
    return true;
  end if;
  return coalesce(public.ip_fail_closed(p_user_id), false);
end;
$$;

-- The single predicate Phase 4 attaches to policies. Kept as one definition so the database
-- gate and the app can never disagree.
create or replace function public.ip_gate_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  mode text;
begin
  if me is null then
    return true;
  end if;

  mode := coalesce(public.ip_effective_mode(me), 'off');
  if mode <> 'enforce' then
    return true;
  end if;

  return not public.ip_would_block_for(me, public.ip_request_ip());
end;
$$;

-- ============================================================
-- 4. Evaluate + record, in one call
-- ============================================================
-- Written only while a target is in Log-only or Enforce mode: in 'off' there is no decision
-- worth keeping, and writing a row per request for everyone would drown the audit.
--
-- De-duplication keeps the table useful instead of a firehose: a would-block is always
-- recorded, while a permitted request is recorded at most once per user+IP per hour.
create or replace function public.ip_guard(
  p_user_id uuid,
  p_ip text,
  p_path text default '',
  p_source text default 'page',
  p_user_agent text default null,
  p_headers jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ip inet;
  v_ip_text text;
  v_mode text;
  v_matched text;
  v_would_block boolean;
  v_allowed boolean;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'ip', null, 'mode', 'off', 'allowed', true,
      'would_block', false, 'matched_rule', '', 'has_rules', false, 'exempt', true
    );
  end if;

  v_ip := public.ip_parse(p_ip);
  v_ip_text := coalesce(v_ip::text, nullif(trim(coalesce(p_ip, '')), ''), 'unknown');
  v_mode := coalesce(public.ip_effective_mode(p_user_id), 'off');
  v_matched := public.ip_matched_rule(p_user_id, v_ip);
  v_would_block := public.ip_would_block_for(p_user_id, v_ip);
  -- 'log_only' can never block, so its verdict is always allowed.
  v_allowed := not (v_mode = 'enforce' and v_would_block);

  if v_mode <> 'off'
     and (
       v_would_block
       or not exists (
         select 1
         from public.ip_access_log l
         where l.user_id = p_user_id
           and l.ip = v_ip_text
           and l.allowed
           and l.created_at > now() - interval '60 minutes'
       )
     ) then
    insert into public.ip_access_log
      (user_id, ip, allowed, would_block, mode, matched_rule, source, path, user_agent, request_headers)
    values
      (p_user_id, v_ip_text, v_allowed, v_would_block, v_mode,
       coalesce(v_matched, case when v_would_block then 'no rule matched' else '' end),
       left(coalesce(p_source, ''), 20), left(coalesce(p_path, ''), 300), left(p_user_agent, 300), p_headers);
  end if;

  return jsonb_build_object(
    'ip', v_ip_text,
    'mode', v_mode,
    'allowed', v_allowed,
    'would_block', v_would_block,
    'matched_rule', coalesce(v_matched, ''),
    'has_rules', public.ip_has_rules(p_user_id),
    'exempt', public.is_ip_exempt_user(p_user_id)
  );
end;
$$;

-- ============================================================
-- 5. Privileges — a user must not be able to probe the allowlist
-- ============================================================
-- Every helper below takes a caller-supplied user id, so an authenticated session could
-- otherwise test arbitrary (account, IP) pairs and map out the allowed ranges. The app
-- reaches all of this through ip_guard as service_role, so nothing else needs access.
--
-- ip_gate_ok() is the exception: it takes no arguments and only answers about the caller,
-- which is exactly what a policy needs.
revoke all on function public.ip_is_allowed(uuid, inet) from public, anon, authenticated;
revoke all on function public.ip_effective_mode(uuid) from public, anon, authenticated;
revoke all on function public.ip_fail_closed(uuid) from public, anon, authenticated;
revoke all on function public.is_ip_exempt_user(uuid) from public, anon, authenticated;
revoke all on function public.ip_has_rules(uuid) from public, anon, authenticated;
revoke all on function public.ip_matched_rule(uuid, inet) from public, anon, authenticated;
revoke all on function public.ip_would_block_for(uuid, inet) from public, anon, authenticated;
revoke all on function public.ip_request_ip() from public, anon, authenticated;

revoke all on function public.ip_guard(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.ip_gate_ok() to authenticated, service_role;
grant execute on function public.ip_guard(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.ip_is_allowed(uuid, inet) to service_role;
grant execute on function public.ip_effective_mode(uuid) to service_role;
grant execute on function public.ip_fail_closed(uuid) to service_role;
grant execute on function public.is_ip_exempt_user(uuid) to service_role;
grant execute on function public.ip_has_rules(uuid) to service_role;
grant execute on function public.ip_matched_rule(uuid, inet) to service_role;
grant execute on function public.ip_would_block_for(uuid, inet) to service_role;
grant execute on function public.ip_request_ip() to service_role;
grant execute on function public.ip_parse(text) to authenticated, service_role;

-- ============================================================
-- 6. Verify
-- ============================================================
-- Log-only rehearsal, as the database itself: nothing is blocked, and the decision is shown.
-- Replace the uuid with a real profile id, and remember this records an audit row.
-- select public.ip_guard(
--   (select id from public.profiles where lower(role) <> 'admin' limit 1),
--   '203.0.113.7', '/portal', 'page', 'psql', '{}'::jsonb
-- );

select count(*) as logged_decisions from public.ip_access_log;
