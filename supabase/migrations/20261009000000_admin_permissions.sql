-- Henderson's Portal — ADMIN PERMISSIONS (idempotent, safe to re-run)
--
-- Why this exists:
--   When the database is provisioned from supabase/migrations/*, the scoping migration
--   only granted SELECT on public.homes / public.pharmacies and granted nothing on
--   public.invitations or public.managed_records. Row Level Security then also needs
--   table-level GRANTs, so admin actions failed with 500s:
--     * "Unable to create client."      (INSERT on homes/pharmacies denied)
--     * /api/admin/invitations 500      (no privileges on invitations)
--     * Data manager save/import failed (no privileges on managed_records)
--   Reads kept working (SELECT was already granted), which is why the lists loaded.
--
-- Applying this migration brings a migrations-only database in line with supabase/schema.sql.

grant usage on schema public to anon, authenticated, service_role;

-- Service role: full access (it also bypasses RLS).
grant all on all tables in schema public to service_role;

-- Signed-in users: privileges are further limited by the RLS policies below.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.homes to authenticated;
grant select, insert, update, delete on public.pharmacies to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select, insert, update, delete on public.managed_records to authenticated;
grant select, insert, update on public.chat_threads to authenticated;
grant select, insert, update on public.portal_messages to authenticated;
grant select on public.portal_documents to authenticated;

-- Tables created later get sane defaults too.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select on tables to authenticated;

-- Let signed-in admins manage invitations through RLS (no service-role key needed).
alter table public.invitations enable row level security;
drop policy if exists "Admins manage invitations" on public.invitations;
create policy "Admins manage invitations" on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Sanity check: these should all be listed.
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
