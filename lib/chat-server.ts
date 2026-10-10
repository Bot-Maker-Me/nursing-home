import type { SupabaseClient } from '@supabase/supabase-js'

export const PHARMACY_SENDER = 'Henderson’s Pharmacy'

type Member = { name: string; email: string; home: string }

export type Conversations = {
  threads: Array<Record<string, unknown> & { member: Member | null }>
  messages: Array<Record<string, unknown>>
}

/** Loads every conversation plus its messages, with best-effort member labels. */
export async function loadConversations(
  supabase: SupabaseClient,
  labelClient: SupabaseClient | null,
): Promise<{ ok: true; data: Conversations } | { ok: false }> {
  const [threadsResponse, messagesResponse] = await Promise.all([
    supabase
      .from('chat_threads')
      .select('id, subject, resident_ref, urgent, home_id, created_by, last_message_at, created_at')
      .order('last_message_at', { ascending: false }),
    supabase
      .from('portal_messages')
      .select('id, thread_id, sender_role, sender_name, body, urgent, read_at, created_at')
      .order('created_at', { ascending: true }),
  ])
  if (threadsResponse.error || messagesResponse.error) return { ok: false }

  const members: Record<string, Member> = {}
  if (labelClient) {
    const { data } = await labelClient.from('profiles').select('id, full_name, home_name')
    for (const profile of data ?? []) {
      members[profile.id] = {
        name: profile.full_name || 'Portal user',
        email: '',
        home: profile.home_name || '',
      }
    }
  }

  return {
    ok: true,
    data: {
      threads: (threadsResponse.data ?? []).map((thread) => ({
        ...thread,
        member: members[thread.created_by] ?? null,
      })),
      messages: messagesResponse.data ?? [],
    },
  }
}

/** Posts a pharmacy reply and marks the home's earlier messages as read. */
export async function sendPharmacyReply(
  supabase: SupabaseClient,
  { threadId, message, urgent }: { threadId: string; message: string; urgent: boolean },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; reason: 'not_found' | 'failed' }> {
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('id, created_by')
    .eq('id', threadId)
    .maybeSingle()
  if (threadError || !thread) return { ok: false, reason: 'not_found' }

  const { data, error } = await supabase
    .from('portal_messages')
    .insert({
      user_id: thread.created_by,
      thread_id: threadId,
      sender_role: 'pharmacy',
      sender_name: PHARMACY_SENDER,
      body: message,
      urgent,
    })
    .select('id, thread_id, sender_role, sender_name, body, urgent, read_at, created_at')
    .single()
  if (error) return { ok: false, reason: 'failed' }

  await supabase
    .from('chat_threads')
    .update({ last_message_at: new Date().toISOString(), urgent: false })
    .eq('id', threadId);

  await supabase
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('sender_role', 'home')
    .is('read_at', null);

  return { ok: true, data }
}
