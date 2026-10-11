-- Add the "education" section to managed_records so Education & Training resources
-- (links, videos and PDF metadata) can be stored alongside the other admin-managed sections.

alter table public.managed_records drop constraint if exists managed_records_section_check;
alter table public.managed_records
  add constraint managed_records_section_check
  check (section in ('policies', 'deliveries', 'cutoffs', 'contacts', 'education'));
