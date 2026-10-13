import type { SupabaseClient } from '@supabase/supabase-js'

export const PHARMACY_SENDER = 'Henderson’s Pharmacy'

type Member = { name: string; email: string; home: string }

const THREAD_COLUMNS = 'id, subject, resident_ref, urgent, home_id, created_by, last_message_at, created_at'

/**
 * Threads, newest first. `archived_at` ships with the chat-archive migration; if that
 * migration has not been run yet we retry without it so the inbox keeps working.
 */
async function selectThreads(supabase: SupabaseClient): Promise<Array<Record<string, unknown>> | null> {
  const withArchive = await supabase
    .from('chat_threads')
    .select(`${THREAD_COLUMNS}, archived_at`)
    .order('last_message_at', { ascending: false })
  if (!withArchive.error) return withArchive.data ?? []

  const withoutArchive = await supabase
    .from('chat_threads')
    .select(THREAD_COLUMNS)
    .order('last_message_at', { ascending: false })
  if (withoutArchive.error) return null
  return (withoutArchive.data ?? []).map((thread) => ({ ...thread, archived_at: null }))
}

export type Conversations = {
  threads: Array<Record<string, unknown> & { member: Member | null; homeName: string }>
  messages: Array<Record<string, unknown>>
}

/**
 * Loads every conversation plus its messages, with best-effort labels for the
 * nursing home each conversation belongs to.
 */
export async function loadConversations(
  supabase: SupabaseClient,
  labelClient: SupabaseClient | null,
): Promise<{ ok: true; data: Conversations } | { ok: false }> {
  const [threadRows, messagesResponse] = await Promise.all([
    selectThreads(supabase),
    supabase
      .from('portal_messages')
      .select('id, thread_id, sender_role, sender_name, body, urgent, read_at, created_at')
      .order('created_at', { ascending: true }),
  ])
  if (!threadRows || messagesResponse.error) return { ok: false }

  const members: Record<string, Member> = {}
  const homes: Record<string, string> = {}
  if (labelClient) {
    const [profilesResponse, homesResponse] = await Promise.all([
      labelClient.from('profiles').select('id, full_name, home_name, role'),
      labelClient.from('homes').select('id, name'),
    ])
    for (const profile of profilesResponse.data ?? []) {
      const role = String(profile.role ?? '').toLowerCase()
      // Staff accounts are not the "member" of a conversation — label the home instead.
      if (role === 'pharmacy' || role === 'admin') continue
      members[profile.id] = {
        name: profile.full_name || 'Portal user',
        email: '',
        home: profile.home_name || '',
      }
    }
    for (const home of homesResponse.data ?? []) homes[home.id] = home.name
  }

  return {
    ok: true,
    data: {
      threads: threadRows.map((thread) => ({
        ...thread,
        member: members[String(thread.created_by)] ?? null,
        homeName: homes[String(thread.home_id ?? '')] ?? '',
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

  // Replying revives an archived conversation back into the inbox.
  await supabase
    .from('chat_threads')
    .update({ last_message_at: new Date().toISOString(), urgent: false, archived_at: null })
    .eq('id', threadId);

  await supabase
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('sender_role', 'home')
    .is('read_at', null);

  return { ok: true, data }
}

/**
 * Archives or restores a conversation. Nothing is deleted — an archived thread stays
 * readable and only drops out of the active inbox.
 */
export async function setThreadArchived(
  supabase: SupabaseClient,
  { threadId, archived }: { threadId: string; archived: boolean },
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'failed' }> {
  const { data, error } = await supabase
    .from('chat_threads')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', threadId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, reason: 'failed' }
  if (!data) return { ok: false, reason: 'not_found' }
  return { ok: true }
}

/**
 * Opens a new conversation with a nursing home on the pharmacy's behalf. The
 * thread is scoped to the home, so the home team sees it in their portal.
 */
export async function startPharmacyThread(
  supabase: SupabaseClient,
  {
    homeId,
    subject,
    residentRef,
    message,
    urgent,
    userId,
  }: { homeId: string; subject: string; residentRef: string; message: string; urgent: boolean; userId: string },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; reason: 'not_found' | 'failed' }> {
  const { data: home, error: homeError } = await supabase
    .from('homes')
    .select('id')
    .eq('id', homeId)
    .maybeSingle()
  if (homeError || !home) return { ok: false, reason: 'not_found' }

  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .insert({
      home_id: homeId,
      subject,
      resident_ref: residentRef,
      urgent,
      created_by: userId,
      last_message_at: new Date().toISOString(),
    })
    .select('id, subject, resident_ref, urgent, home_id, created_by, last_message_at, created_at')
    .single()
  if (threadError || !thread) return { ok: false, reason: 'failed' }

  const { error: messageError } = await supabase.from('portal_messages').insert({
    user_id: userId,
    thread_id: thread.id,
    sender_role: 'pharmacy',
    sender_name: PHARMACY_SENDER,
    body: message,
    urgent,
  })
  if (messageError) return { ok: false, reason: 'failed' }

  return { ok: true, data: thread }
}
