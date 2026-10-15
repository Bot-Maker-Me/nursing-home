import { ThreadConsole } from '@/components/admin/thread-console'
import { PushNotificationSettings } from '@/components/portal/push-notifications'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Conversations — LTC Portal',
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
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-4xl lg:text-5xl">Conversations</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Secure, real-time chat with the care homes. Pick a nursing home to focus the conversation list, reply, or start a new conversation — messages appear instantly for the home team.
        </p>
      </header>
      {/* Pharmacy staff are redirected away from /portal/account, which used to be the only
          place a device could opt in — so no pharmacy device was ever subscribed and every
          care-home message alerted nobody. This is that control, here on the console. */}
      <section className="mt-6 border border-hairline p-5">
        <h2 className="text-sm font-semibold">Message alerts</h2>
        <div className="mt-3">
          <PushNotificationSettings />
        </div>
      </section>
      <div className="mt-8">
        <ThreadConsole endpoint="/api/pharmacy/threads" allowNew homeFilter />
      </div>
    </>
  )
}
