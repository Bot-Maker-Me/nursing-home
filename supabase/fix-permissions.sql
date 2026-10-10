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

-- Sanity check: list the tables you should see
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
