-- Henderson's Pharmacy Client Portal — COMPLETE schema (single file, idempotent).
--
-- Use this to set up a brand-new Supabase database in one go:
--   Supabase → SQL Editor → paste ALL of this → Run.
--
-- Safe to run more than once: every statement is guarded (if not exists / drop policy if exists).
-- When starting from scratch you do NOT need the files in supabase/migrations/.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Tables
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'Authorized partner',
  home_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'Authorized partner';
alter table public.profiles add column if not exists home_name text not null default '';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  address text not null default '',
  phone text not null default '',
  beds integer not null default 0,
  pharmacist text not null default '',
  pharmacist_phone text not null default '',
  after_hours text not null default '',
  status text not null default 'active' check (status in ('active','suspended')),
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- "create table if not exists" is a no-op on an older homes table, so add any missing columns.
alter table public.homes add column if not exists city text not null default '';
alter table public.homes add column if not exists address text not null default '';
alter table public.homes add column if not exists phone text not null default '';
alter table public.homes add column if not exists beds integer not null default 0;
alter table public.homes add column if not exists pharmacist text not null default '';
alter table public.homes add column if not exists pharmacist_phone text not null default '';
alter table public.homes add column if not exists after_hours text not null default '';
alter table public.homes add column if not exists status text not null default 'active';
-- Per-home custom theme, e.g. {"slug":"tony-stacey"} (see lib/home-themes.ts).
alter table public.homes add column if not exists theme jsonb not null default '{}'::jsonb;

create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
alter table public.pharmacies add column if not exists phone text not null default '';
alter table public.pharmacies add column if not exists email text not null default '';

alter table public.profiles add column if not exists home_id uuid references public.homes(id) on delete set null;
alter table public.profiles add column if not exists pharmacy_id uuid references public.pharmacies(id) on delete set null;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null unique,
  home_name text not null default '',
  role text not null default 'Authorized partner',
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_email_idx on public.invitations(lower(email));

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  home_id uuid references public.homes(id) on delete set null,
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  resident_ref text not null default '',
  subject text not null default 'New conversation',
  urgent boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists chat_threads_home_idx on public.chat_threads(home_id, last_message_at desc);
-- "create table if not exists" is a no-op on an older chat_threads table.
alter table public.chat_threads add column if not exists archived_at timestamptz;
create index if not exists chat_threads_archived_idx on public.chat_threads(archived_at);

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.chat_threads(id) on delete cascade,
  sender_role text not null check (sender_role in ('home', 'pharmacy')),
  sender_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  urgent boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.portal_messages add column if not exists thread_id uuid references public.chat_threads(id) on delete cascade;
alter table public.portal_messages add column if not exists urgent boolean not null default false;
alter table public.portal_messages add column if not exists read_at timestamptz;
create index if not exists portal_messages_user_created_idx on public.portal_messages(user_id, created_at);
create index if not exists portal_messages_thread_idx on public.portal_messages(thread_id, created_at);

create table if not exists public.portal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  home_id uuid references public.homes(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  section text not null default 'policies',
  created_at timestamptz not null default now()
);
alter table public.portal_documents add column if not exists home_id uuid references public.homes(id) on delete cascade;
alter table public.portal_documents add column if not exists pharmacy_id uuid references public.pharmacies(id) on delete cascade;
alter table public.portal_documents add column if not exists section text not null default 'policies';
alter table public.portal_documents alter column user_id drop not null;
create index if not exists portal_documents_user_created_idx on public.portal_documents(user_id, created_at desc);

create table if not exists public.managed_records (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('policies','deliveries','cutoffs','contacts','education')),
  home_id uuid references public.homes(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint managed_records_scope check ((home_id is not null) <> (pharmacy_id is not null))
);
-- "create table if not exists" is a no-op on an older managed_records table, so make sure
-- the section constraint allows the education section on existing databases too.
alter table public.managed_records drop constraint if exists managed_records_section_check;
alter table public.managed_records
  add constraint managed_records_section_check
  check (section in ('policies','deliveries','cutoffs','contacts','education'));
create index if not exists managed_records_scope_idx on public.managed_records(section, home_id, pharmacy_id);

-- ============================================================
-- 2. Functions
-- ============================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- SECURITY DEFINER is required: the trigger runs while Supabase Auth inserts into
-- auth.users (as supabase_auth_admin), which has no privileges on public.profiles and
-- would be blocked by RLS — sign-up then fails with "Database error saving new user".
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, home_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'Authorized partner', coalesce(new.raw_user_meta_data ->> 'home_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'admin');
$$;

create or replace function public.current_home_id() returns uuid
language sql security definer set search_path = public stable as $$
  select p.home_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.current_pharmacy_id() returns uuid
language sql security definer set search_path = public stable as $$
  select p.pharmacy_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_pharmacy() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'pharmacy');
$$;

create or replace function public.can_access_thread(tid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select public.is_admin() or public.is_pharmacy() or exists (
    select 1 from public.chat_threads t
    where t.id = tid and (t.created_by = auth.uid() or t.home_id = public.current_home_id())
  );
$$;

-- ============================================================
-- 3. Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.pharmacies enable row level security;
alter table public.invitations enable row level security;
alter table public.chat_threads enable row level security;
alter table public.portal_messages enable row level security;
alter table public.portal_documents enable row level security;
alter table public.managed_records enable row level security;

-- profiles
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated
  using (public.is_admin() or (select auth.uid()) = id);

-- homes / pharmacies
drop policy if exists "Read own home" on public.homes;
create policy "Read own home" on public.homes for select to authenticated using (public.is_admin() or id = public.current_home_id());
drop policy if exists "Pharmacy reads homes" on public.homes;
create policy "Pharmacy reads homes" on public.homes for select to authenticated using (public.is_pharmacy());
drop policy if exists "Admins manage homes" on public.homes;
create policy "Admins manage homes" on public.homes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Read own pharmacy" on public.pharmacies;
create policy "Read own pharmacy" on public.pharmacies for select to authenticated using (public.is_admin() or id = public.current_pharmacy_id());
drop policy if exists "Admins manage pharmacies" on public.pharmacies;
create policy "Admins manage pharmacies" on public.pharmacies for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- chat_threads
drop policy if exists "Read scoped threads" on public.chat_threads;
create policy "Read scoped threads" on public.chat_threads for select to authenticated
  using (public.is_admin() or public.is_pharmacy() or created_by = (select auth.uid()) or home_id = public.current_home_id());
drop policy if exists "Start own threads" on public.chat_threads;
create policy "Start own threads" on public.chat_threads for insert to authenticated
  with check (created_by = (select auth.uid()) and (home_id = public.current_home_id() or home_id is null));
drop policy if exists "Update scoped threads" on public.chat_threads;
create policy "Update scoped threads" on public.chat_threads for update to authenticated
  using (public.is_admin() or public.is_pharmacy() or created_by = (select auth.uid()) or home_id = public.current_home_id());
drop policy if exists "Pharmacy starts threads" on public.chat_threads;
create policy "Pharmacy starts threads" on public.chat_threads for insert to authenticated
  with check (public.is_pharmacy() and created_by = (select auth.uid()));

-- portal_messages
drop policy if exists "Users can read their own portal messages" on public.portal_messages;
create policy "Users can read their own portal messages" on public.portal_messages for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()) or public.can_access_thread(thread_id));
drop policy if exists "Users can send their own portal messages" on public.portal_messages;
create policy "Users can send their own portal messages" on public.portal_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and sender_role = 'home');
drop policy if exists "Admins can send pharmacy messages" on public.portal_messages;
create policy "Admins can send pharmacy messages" on public.portal_messages for insert to authenticated
  with check (public.is_admin() or public.is_pharmacy());
drop policy if exists "Scoped users can mark messages read" on public.portal_messages;
create policy "Scoped users can mark messages read" on public.portal_messages for update to authenticated
  using (public.is_admin() or public.can_access_thread(thread_id) or user_id = (select auth.uid())) with check (true);

-- portal_documents
drop policy if exists "Users can read their own documents" on public.portal_documents;
create policy "Users can read their own documents" on public.portal_documents for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()) or home_id = public.current_home_id() or pharmacy_id = public.current_pharmacy_id());

-- managed_records
drop policy if exists "Read scoped records" on public.managed_records;
create policy "Read scoped records" on public.managed_records for select to authenticated
  using (public.is_admin() or home_id = public.current_home_id() or pharmacy_id = public.current_pharmacy_id());
drop policy if exists "Admins manage records" on public.managed_records;
create policy "Admins manage records" on public.managed_records for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- invitations: managed by admins through RLS (no service key required)
drop policy if exists "Admins manage invitations" on public.invitations;
create policy "Admins manage invitations" on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 4. Grants
-- ============================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.homes to authenticated;
grant select, insert, update, delete on public.pharmacies to authenticated;
grant select, insert, update, delete on public.managed_records to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select, insert, update on public.chat_threads to authenticated;
grant select, insert, update on public.portal_messages to authenticated;
grant select on public.portal_documents to authenticated;

-- ============================================================
-- 5. Triggers
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists managed_records_set_updated_at on public.managed_records;
create trigger managed_records_set_updated_at before update on public.managed_records for each row execute function public.set_updated_at();

-- ============================================================
-- 6. Realtime (live chat)
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_threads') then
    alter publication supabase_realtime add table public.chat_threads;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='portal_messages') then
    alter publication supabase_realtime add table public.portal_messages;
  end if;
end $$;

-- ============================================================
-- 7. Seed a pharmacy + sample homes (only if empty)
-- ============================================================
insert into public.pharmacies (name, phone, email)
select 'Henderson''s Pharmacy', '905-555-0100', 'pharmacy@hendersonsportal.ca'
where not exists (select 1 from public.pharmacies);

insert into public.homes (name, city, beds, pharmacist, pharmacist_phone, after_hours, status)
select seed.name, seed.city, seed.beds, seed.pharmacist, seed.pharmacist_phone, seed.after_hours, seed.status
from (values
  ('Maple Ridge Care Home','Hamilton, ON',128,'Dr. Priya Raman, RPh','905-555-0142','905-555-0199','active'),
  ('Lakeshore Gardens LTC','Burlington, ON',96,'Marcus Leblanc, RPh','905-555-0157','905-555-0199','active'),
  ('Cedarview Residence','Oakville, ON',64,'Dr. Priya Raman, RPh','905-555-0163','905-555-0199','suspended')
) as seed(name, city, beds, pharmacist, pharmacist_phone, after_hours, status)
where not exists (select 1 from public.homes);

-- Tony Stacey Centre for Veterans' Care — registered with its own unique theme.
insert into public.homes (name, city, address, phone, beds, pharmacist, pharmacist_phone, after_hours, status, theme)
select
  'Tony Stacey Centre for Veterans'' Care',
  'Toronto, ON',
  '59 Lawson Road, Toronto, Ontario M1C 2J1',
  '1-416-284-9235',
  0,
  'Dr. Priya Raman, RPh',
  '1-416-284-9235',
  '905-555-0199',
  'active',
  '{"slug":"tony-stacey"}'::jsonb
where not exists (
  select 1 from public.homes where name = 'Tony Stacey Centre for Veterans'' Care'
);

-- ============================================================
-- 8. Storage (wrapped so a privilege error can't abort the run)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('portal-documents', 'portal-documents', false)
on conflict (id) do nothing;

do $$ begin
  execute $p$ drop policy if exists "Users can download their portal documents" on storage.objects $p$;
  execute $p$
    create policy "Users can download their portal documents" on storage.objects for select to authenticated
    using (
      bucket_id = 'portal-documents' and (
        public.is_admin()
        or (storage.foldername(name))[1] = (select auth.uid())::text
        or ((storage.foldername(name))[1] = 'client' and (storage.foldername(name))[2] = public.current_home_id()::text)
        or ((storage.foldername(name))[1] = 'pharmacy' and (storage.foldername(name))[2] = public.current_pharmacy_id()::text)
      )
    )
  $p$;
exception when others then
  raise notice 'Skipped storage SELECT policy (create it in Storage → Policies): %', sqlerrm;
end $$;

do $$ begin
  execute $p$ drop policy if exists "Admins can upload portal documents" on storage.objects $p$;
  execute $p$
    create policy "Admins can upload portal documents" on storage.objects for insert to authenticated
    with check (bucket_id = 'portal-documents' and public.is_admin())
  $p$;
exception when others then
  raise notice 'Skipped storage INSERT policy (create it in Storage → Policies): %', sqlerrm;
end $$;

-- ============================================================
-- 9. Web Push notifications
-- ============================================================
-- One row per browser/device that opted in. RLS keeps every user to their own rows;
-- the service-role key used by the send-push Edge Function bypasses it.
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
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
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

-- pg_net fires the send-push Edge Function after an insert, off the request path.
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is unavailable (%); the push trigger will be created but idle.', sqlerrm;
end $$;

-- Configuration lives in Supabase Vault (never in this file, never in client code):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-push', 'push_function_url');
--   select vault.create_secret('<service_role key>', 'push_service_role_key');
-- Without both secrets the trigger is a no-op and messaging keeps working.
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
    null; -- Push is best-effort; it must never fail the message insert.
  end;

  return new;
end;
$$;

drop trigger if exists portal_messages_send_push on public.portal_messages;
create trigger portal_messages_send_push
  after insert on public.portal_messages
  for each row execute function public.send_push_on_portal_message();

revoke all on function public.send_push_on_portal_message() from public, anon, authenticated;
