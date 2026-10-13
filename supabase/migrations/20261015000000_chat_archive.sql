-- Conversation archiving.
--
-- Archived conversations stay fully readable (nothing is deleted) but drop out of the
-- active inbox, so the pharmacy can clear finished threads without losing the audit trail.
-- A reply to an archived thread clears `archived_at`, bringing it back to the inbox.

alter table public.chat_threads add column if not exists archived_at timestamptz;

create index if not exists chat_threads_archived_idx on public.chat_threads(archived_at);
