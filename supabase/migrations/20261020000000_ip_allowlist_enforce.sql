-- Henderson's Portal — IP allowlist PHASE 4: enforcement.
--
-- Run AFTER 20261019000000_ip_access_logging.sql (this script stops with a clear message if
-- it has not been). Additive and idempotent.
--
-- How the database side is attached: every table below gets ONE new policy that is declared
-- RESTRICTIVE. Permissive policies are OR-ed together, but a restrictive policy is AND-ed
-- with all of them — so this gates each table completely WITHOUT editing, dropping or
-- duplicating a single existing policy. Nothing that works today changes for an allowed
-- caller, because public.ip_gate_ok() answers true for them.
--
-- Because it is a database policy, it also protects every OTHER application on this shared
-- database — the Pharma Portal included — for any request made with a signed-in user's
-- session, with no code change in that app. (Only the service role bypasses RLS; if the
-- Pharma Portal queries with a service key, see the notes at the bottom of this file.)

do $$
begin
  if to_regproc('public.ip_gate_ok()') is null then
    raise exception 'public.ip_gate_ok() is missing — run 20261019000000_ip_access_logging.sql first.';
  end if;
end $$;

-- ============================================================
-- 1. The client IP, as the database sees it (case-insensitive headers)
-- ============================================================
-- Supersedes the Phase 3 definition. Header names are case-insensitive in HTTP and proxies
-- serialise them differently, so the keys are lower-cased before they are read — a
-- mis-cased lookup would silently fail open and leave the database gate doing nothing.
--
-- plpgsql so the parse can never RAISE: an exception inside a policy would turn every query
-- into a 500.
create or replace function public.ip_request_ip()
returns inet
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw jsonb;
  headers jsonb;
  forwarded text;
  candidate text;
begin
  begin
    raw := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    return null;
  end;

  select coalesce(jsonb_object_agg(lower(key), value), '{}'::jsonb) into headers from jsonb_each(raw);

  candidate := nullif(trim(coalesce(headers ->> 'x-real-ip', '')), '');

  if candidate is null then
    forwarded := coalesce(headers ->> 'x-forwarded-for', '');
    if forwarded <> '' then
      -- Last comma-separated entry: the address the trusted edge appended. Anything a client
      -- prepends sits to its left and can never be mistaken for the real address.
      candidate := nullif(trim(split_part(forwarded, ',', array_length(string_to_array(forwarded, ','), 1))), '');
    end if;
  end if;

  return public.ip_parse(candidate);
end;
$$;

revoke all on function public.ip_request_ip() from public, anon, authenticated;
grant execute on function public.ip_request_ip() to service_role;

-- ============================================================
-- 2. Gate the shared tables
-- ============================================================
do $$
declare
  gate_table text;
begin
  foreach gate_table in array array[
    'profiles',
    'homes',
    'pharmacies',
    'invitations',
    'chat_threads',
    'portal_messages',
    'portal_documents',
    'managed_records',
    'push_subscriptions'
  ]
  loop
    if to_regclass('public.' || gate_table) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', 'IP allowlist gate', gate_table);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ((select public.ip_gate_ok())) with check ((select public.ip_gate_ok()))',
      'IP allowlist gate',
      gate_table
    );
  end loop;
end $$;

-- The documents bucket, so a blocked session cannot fetch or upload files either.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  execute 'drop policy if exists "IP allowlist gate" on storage.objects';
  execute
    'create policy "IP allowlist gate" on storage.objects as restrictive for all to authenticated '
    'using ((select public.ip_gate_ok())) with check ((select public.ip_gate_ok()))';
exception when insufficient_privilege then
  raise notice 'Skipped storage.objects: add an equivalent restricted policy in Storage → Policies.';
end $$;

-- ============================================================
-- 3. Verify
-- ============================================================
-- Every row below should show has_gate = true. A table listed with has_gate = false is either
-- a Pharma Portal table that still needs the same one-line policy, or a table whose RLS is
-- intentionally not user-facing.
select c.relname as table_name,
       exists (
         select 1 from pg_policy pol
         where pol.polrelid = c.oid and pol.polname = 'IP allowlist gate'
       ) as has_gate
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
order by has_gate, c.relname;

-- The gate, as it evaluates right now (NULL headers = no HTTP request, so it answers true):
select public.ip_gate_ok() as gate_open_now;

-- ============================================================
-- 4. Adding the gate to the Pharma Portal's own tables
-- ============================================================
-- Both pieces are generic and already installed in this shared database, so protecting another
-- app's tables is one statement each — replace the table name:
--
--   create policy "IP allowlist gate" on public.<their_table>
--     as restrictive for all to authenticated
--     using ((select public.ip_gate_ok()))
--     with check ((select public.ip_gate_ok()));
--
-- That covers requests made with the signed-in user's session key. If that app instead reads
-- and writes with the SERVICE ROLE key, RLS is bypassed by design and it has to make the same
-- check in its own server layer — one call, using this database's function:
--
--   await supabaseAdmin.rpc('ip_guard', {
--     p_user_id: user.id, p_ip: clientIp, p_path: '/', p_source: 'page',
--   })
--   // { mode, allowed, would_block, matched_rule, exempt }
--
-- ...and refuse the request when `allowed` is false, exactly as this app does.
