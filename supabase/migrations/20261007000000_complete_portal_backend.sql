-- Henderson's Portal backend schema
-- Apply once in the connected Supabase project's SQL editor.

create extension if not exists pgcrypto;

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

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('home', 'pharmacy')),
  sender_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists portal_messages_user_created_idx on public.portal_messages(user_id, created_at);

create table if not exists public.portal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists portal_documents_user_created_idx on public.portal_documents(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.portal_messages enable row level security;
alter table public.portal_documents enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users can read their own portal messages" on public.portal_messages;
create policy "Users can read their own portal messages" on public.portal_messages for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can send their own portal messages" on public.portal_messages;
create policy "Users can send their own portal messages" on public.portal_messages for insert to authenticated with check ((select auth.uid()) = user_id and sender_role = 'home');

drop policy if exists "Users can read their own documents" on public.portal_documents;
create policy "Users can read their own documents" on public.portal_documents for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.profiles to authenticated;
grant select, insert on public.portal_messages to authenticated;
grant select on public.portal_documents to authenticated;

insert into storage.buckets (id, name, public)
values ('portal-documents', 'portal-documents', false)
on conflict (id) do nothing;

drop policy if exists "Users can download their portal documents" on storage.objects;
create policy "Users can download their portal documents" on storage.objects for select to authenticated using (bucket_id = 'portal-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portal_messages') then
    alter publication supabase_realtime add table public.portal_messages;
  end if;
exception when undefined_object then
  null;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security invoker set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, home_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'Authorized partner', coalesce(new.raw_user_meta_data ->> 'home_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Admin API uses the Supabase service role server-side. Never expose that key in client code.
