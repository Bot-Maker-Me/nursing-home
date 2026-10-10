-- Dedicated pharmacy login: a non-admin role ("pharmacy") that can chat with care homes.
--
-- Adds public.is_pharmacy() and lets that role read every conversation, reply as the
-- pharmacy, and mark home messages as read. Idempotent — safe to re-run.
--
-- Create a pharmacy account by giving its profile the role 'pharmacy':
--   update public.profiles set role = 'pharmacy' where id = (
--     select id from auth.users where email = 'pharmacy@yourdomain.ca'
--   );

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

-- chat_threads: pharmacy staff can read and update every conversation.
drop policy if exists "Read scoped threads" on public.chat_threads;
create policy "Read scoped threads" on public.chat_threads for select to authenticated
  using (public.is_admin() or public.is_pharmacy() or created_by = (select auth.uid()) or home_id = public.current_home_id());

drop policy if exists "Update scoped threads" on public.chat_threads;
create policy "Update scoped threads" on public.chat_threads for update to authenticated
  using (public.is_admin() or public.is_pharmacy() or created_by = (select auth.uid()) or home_id = public.current_home_id());

-- portal_messages: read every thread, send as the pharmacy, and mark messages read.
drop policy if exists "Users can read their own portal messages" on public.portal_messages;
create policy "Users can read their own portal messages" on public.portal_messages for select to authenticated
  using (public.is_admin() or public.is_pharmacy() or user_id = (select auth.uid()) or public.can_access_thread(thread_id));

drop policy if exists "Admins can send pharmacy messages" on public.portal_messages;
create policy "Admins can send pharmacy messages" on public.portal_messages for insert to authenticated
  with check (public.is_admin() or public.is_pharmacy());

drop policy if exists "Scoped users can mark messages read" on public.portal_messages;
create policy "Scoped users can mark messages read" on public.portal_messages for update to authenticated
  using (public.is_admin() or public.is_pharmacy() or public.can_access_thread(thread_id) or user_id = (select auth.uid())) with check (true);

grant select, insert, update on public.chat_threads to authenticated;
grant select, insert, update on public.portal_messages to authenticated;
grant execute on function public.is_pharmacy() to authenticated;

-- Sanity check: your staff accounts.
select id, full_name, role from public.profiles where lower(role) in ('admin', 'pharmacy') order by role;
