-- Pharmacy team can start conversations with care homes (not just reply to them).
--
-- Adds:
--   * "Pharmacy starts threads" — lets a 'pharmacy' profile create a chat_threads
--     row scoped to a home, so the home team sees the new conversation in their portal.
--   * "Pharmacy reads homes" — lets the pharmacy console list homes to message.
--
-- Idempotent — safe to re-run. Depends on public.is_pharmacy() from
-- 20261011000000_pharmacy_role.sql.

create or replace function public.is_pharmacy() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'pharmacy');
$$;

drop policy if exists "Pharmacy starts threads" on public.chat_threads;
create policy "Pharmacy starts threads" on public.chat_threads for insert to authenticated
  with check (public.is_pharmacy() and created_by = (select auth.uid()));

drop policy if exists "Pharmacy reads homes" on public.homes;
create policy "Pharmacy reads homes" on public.homes for select to authenticated
  using (public.is_pharmacy());

grant select, insert, update on public.chat_threads to authenticated;
grant select, insert, update on public.portal_messages to authenticated;
grant execute on function public.is_pharmacy() to authenticated;

-- Sanity check: staff accounts and their roles.
select id, full_name, role from public.profiles where lower(role) in ('admin', 'pharmacy') order by role;
