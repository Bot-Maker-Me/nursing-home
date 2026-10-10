-- Fix: sign-up / invitation activation fails with HTTP 500 "Database error saving new user".
--
-- Cause: public.handle_new_user() was created with SECURITY INVOKER. The trigger fires
-- while Supabase Auth inserts the new row into auth.users (as the `supabase_auth_admin`
-- role). That role has no table privileges on public.profiles and the table's RLS has no
-- INSERT policy, so the insert raised an error and the whole sign-up rolled back.
--
-- Fix: run the trigger as its owner (SECURITY DEFINER), which bypasses RLS and carries the
-- needed privileges. Idempotent — safe to re-run.

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
