-- Henderson's Portal: Web Push notifications.
--
-- Apply in the Supabase SQL editor. Idempotent — safe to run more than once.
--
-- What this does:
--   1. `push_subscriptions` — one row per browser/device that opted in, plus its RLS
--      policies so a signed-in user can only ever touch their own rows.
--   2. A trigger on `portal_messages` that fires the `send-push` Edge Function
--      asynchronously through pg_net. The insert is never blocked and never waits on
--      the push service, which is why pg_net (not a synchronous HTTP call) is used.
--
-- The trigger reads its two configuration values from Supabase Vault, so the
-- service-role key is never stored in this file and never in client code. Add them
-- ONCE, in the SQL editor, with your own values (see DEPLOY.md → Web Push):
--
--   select vault.create_secret(
--     'https://<your-project-ref>.supabase.co/functions/v1/send-push',
--     'push_function_url');
--   select vault.create_secret('<your service_role key>', 'push_service_role_key');
--
-- Until both secrets exist the trigger is a no-op and messages keep working.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
drop policy if exists push_subscriptions_own_read on public.push_subscriptions;
drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_read   on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_own_update on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- pg_net gives the trigger a non-blocking, fire-and-forget HTTP client.
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is unavailable (%); the push trigger will be created but idle.', sqlerrm;
end $$;

create or replace function public.send_push_on_portal_message() returns trigger
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  function_url text;
  service_key text;
begin
  begin
    select decrypted_secret into function_url from vault.decrypted_secrets where name = 'push_function_url' limit 1;
    select decrypted_secret into service_key from vault.decrypted_secrets where name = 'push_service_role_key' limit 1;
  exception when others then
    function_url := null;
    service_key := null;
  end;

  -- Not configured yet (or vault is unreadable): stay silent, keep the insert.
  if function_url is null or service_key is null then
    return new;
  end if;

  -- Whitespace is never part of a URL or a JWT, so stripping it undoes a secret pasted from
  -- a wrapped terminal line. Left in, a newline inside the Authorization header makes
  -- libcurl refuse the whole request before it is sent ("A libcurl function was given a bad
  -- argument"): the response row lands with a NULL status_code, the Edge Function is never
  -- called, its logs stay empty, and no notification ever arrives anywhere.
  function_url := regexp_replace(function_url, '\s', '', 'g');
  service_key := regexp_replace(service_key, '\s', '', 'g');

  -- Diagnose rather than idle silently. `raise warning` is the database's equivalent of a
  -- console log: a bad value here is the most common reason no push is ever delivered, and
  -- it is otherwise completely invisible from the app.
  if function_url !~ '^https?://' then
    raise warning 'push: Vault secret push_function_url is not an http(s) URL, so the send-push trigger is idle. Fix it with vault.update_secret().';
    return new;
  end if;
  -- A service-role key is a JWT: three base64url segments separated by dots. A VAPID key
  -- (87 or 43 characters) pasted into this secret looks like a credential but is not one.
  if service_key !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise warning 'push: Vault secret push_service_role_key is not a service-role JWT, so the send-push trigger is idle. Set it to the project''s service_role key.';
    return new;
  end if;

  -- Thread-less rows have no scope to notify.
  if new.thread_id is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'id', new.id,
        'thread_id', new.thread_id,
        'user_id', new.user_id,
        'sender_role', new.sender_role
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- Push is best-effort. Nothing here may ever fail the message insert.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists portal_messages_send_push on public.portal_messages;
create trigger portal_messages_send_push
  after insert on public.portal_messages
  for each row execute function public.send_push_on_portal_message();

-- The function is trigger-only: no API surface, no public execute.
revoke all on function public.send_push_on_portal_message() from public, anon, authenticated;
