create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('home', 'pharmacy')),
  sender_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists portal_messages_user_created_idx on public.portal_messages(user_id, created_at);
alter table public.portal_messages enable row level security;

drop policy if exists "Users can read their own portal messages" on public.portal_messages;
create policy "Users can read their own portal messages" on public.portal_messages for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can send their own portal messages" on public.portal_messages;
create policy "Users can send their own portal messages" on public.portal_messages for insert to authenticated with check ((select auth.uid()) = user_id and sender_role = 'home');

-- Admin/service-role access is handled server-side; service_role bypasses RLS.
grant select, insert on public.portal_messages to authenticated;

-- Enables Supabase Realtime for the free live-chat experience when the project applies this migration.
alter publication supabase_realtime add table public.portal_messages;
