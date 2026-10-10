import { ChatPanel } from '@/components/portal/chat-panel'
import { PageHeader } from '@/components/portal/page-header'
import { createClient } from '@/lib/supabase/server'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('home_name').eq('id', user.id).maybeSingle()
    : { data: null }
  const homeName = profile?.home_name || 'Your home'

  return (
    <>
      <PageHeader
        crumb={`${homeName} / Connect with Pharmacy`}
        title="Connect with Pharmacy"
        description="Secure, real-time chat with the pharmacy team. For communication only — this is not an ordering channel. Use resident IDs or initials, never full names."
      />
      <ChatPanel homeName={homeName} />
    </>
  )
}
