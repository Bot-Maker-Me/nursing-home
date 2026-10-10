-- Henderson's Portal — FIX PERMISSIONS
-- Run this in the Supabase SQL Editor if you see errors like:
--   * "permission denied for table invitations"
--   * "Unable to create client" / 500 errors in the admin panel
--
-- Cause: RLS policies restrict *rows*, but Postgres also needs table-level GRANTs.
-- This script is idempotent — safe to run more than once.

grant usage on schema public to anon, authenticated, service_role;

-- Service role: full access (it also bypasses RLS)
grant all on all tables in schema public to service_role;

-- Signed-in users: privileges are further limited by the RLS policies.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.homes to authenticated;
grant select, insert, update, delete on public.pharmacies to authenticated;
grant select, insert, update, delete on public.managed_records to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select, insert, update on public.chat_threads to authenticated;
grant select, insert, update on public.portal_messages to authenticated;
grant select on public.portal_documents to authenticated;

-- Let signed-in admins manage invitations through RLS (so the invitations API
-- no longer needs the service-role key).
alter table public.invitations enable row level security;
drop policy if exists "Admins manage invitations" on public.invitations;
create policy "Admins manage invitations" on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Default privileges for tables created later
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select on tables to authenticated;

-- Fix sign-up failing with HTTP 500 "Database error saving new user".
-- The profile trigger ran as SECURITY INVOKER (as supabase_auth_admin), which has no
-- privileges on public.profiles and is blocked by RLS. Running it as SECURITY DEFINER
-- lets the trigger create the profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, home_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'Authorized partner',
    coalesce(new.raw_user_meta_data ->> 'home_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sanity check: list the tables you should see
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
