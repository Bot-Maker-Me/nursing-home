import { ChatPanel } from '@/components/portal/chat-panel'
import { PageHeader } from '@/components/portal/page-header'
import { getTenantName } from '@/lib/auth'

export default async function MessagesPage() {
  const homeName = await getTenantName()

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
