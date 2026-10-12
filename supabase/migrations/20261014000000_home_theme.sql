-- Per-home custom theming + extra contact details.
--
-- `theme` stores a home's unique theme reference, e.g. {"slug":"tony-stacey"}. The theme
-- is resolved (see lib/home-themes.ts) and applied ONLY inside that home's portal shell,
-- so it never affects other homes, the pharmacy/admin consoles or the public site.

alter table public.homes add column if not exists theme jsonb not null default '{}'::jsonb;
alter table public.homes add column if not exists address text not null default '';
alter table public.homes add column if not exists phone text not null default '';

-- Register the Tony Stacey Centre for Veterans' Care as its own client with its own theme.
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

-- Make sure the new columns carry the theme on databases created before this migration.
update public.homes
set theme = '{"slug":"tony-stacey"}'::jsonb
where name = 'Tony Stacey Centre for Veterans'' Care'
  and (theme is null or theme = '{}'::jsonb);
