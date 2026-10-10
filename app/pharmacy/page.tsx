import { ThreadConsole } from '@/components/admin/thread-console'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: "Conversations — Henderson's Pharmacy",
}

export default async function PharmacyConversationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('home_name').eq('id', user.id).maybeSingle()
    : { data: null }
  const pharmacyName = profile?.home_name || "Henderson's Pharmacy"

  return (
    <>
      <header className="border-b border-hairline pb-8">
        <p className="text-xs text-muted-foreground">{pharmacyName} / Conversations</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.045em] sm:text-5xl">Conversations</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Secure, real-time chat with the care homes. Reply to a nursing home or start a new conversation — messages appear instantly for the home team.
        </p>
      </header>
      <div className="mt-8">
        <ThreadConsole endpoint="/api/pharmacy/threads" allowNew />
      </div>
    </>
  )
}
