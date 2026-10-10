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
  beds integer not null default 0,
  pharmacist text not null default '',
  pharmacist_phone text not null default '',
  after_hours text not null default '',
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

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
  last_message_at timestamptz not null default now()
);
create index if not exists chat_threads_home_idx on public.chat_threads(home_id, last_message_at desc);

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
  section text not null check (section in ('policies','deliveries','cutoffs','contacts')),
  home_id uuid references public.homes(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint managed_records_scope check ((home_id is not null) <> (pharmacy_id is not null))
);
create index if not exists managed_records_scope_idx on public.managed_records(section, home_id, pharmacy_id);

-- ============================================================
-- 2. Functions
-- ============================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security invoker set search_path = public as $$
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

create or replace function public.can_access_thread(tid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select public.is_admin() or exists (
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
drop policy if exists "Admins manage homes" on public.homes;
create policy "Admins manage homes" on public.homes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Read own pharmacy" on public.pharmacies;
create policy "Read own pharmacy" on public.pharmacies for select to authenticated using (public.is_admin() or id = public.current_pharmacy_id());
drop policy if exists "Admins manage pharmacies" on public.pharmacies;
create policy "Admins manage pharmacies" on public.pharmacies for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- chat_threads
drop policy if exists "Read scoped threads" on public.chat_threads;
create policy "Read scoped threads" on public.chat_threads for select to authenticated
  using (public.is_admin() or created_by = (select auth.uid()) or home_id = public.current_home_id());
drop policy if exists "Start own threads" on public.chat_threads;
create policy "Start own threads" on public.chat_threads for insert to authenticated
  with check (created_by = (select auth.uid()) and (home_id = public.current_home_id() or home_id is null));
drop policy if exists "Update scoped threads" on public.chat_threads;
create policy "Update scoped threads" on public.chat_threads for update to authenticated
  using (public.is_admin() or created_by = (select auth.uid()) or home_id = public.current_home_id());

-- portal_messages
drop policy if exists "Users can read their own portal messages" on public.portal_messages;
create policy "Users can read their own portal messages" on public.portal_messages for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()) or public.can_access_thread(thread_id));
drop policy if exists "Users can send their own portal messages" on public.portal_messages;
create policy "Users can send their own portal messages" on public.portal_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and sender_role = 'home');
drop policy if exists "Admins can send pharmacy messages" on public.portal_messages;
create policy "Admins can send pharmacy messages" on public.portal_messages for insert to authenticated
  with check (public.is_admin());
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
