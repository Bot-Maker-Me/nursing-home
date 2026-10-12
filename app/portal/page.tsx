import { FileText } from 'lucide-react'
import { Card, PageHeader } from '@/components/portal/page-header'
import { getCurrentUser, getPortalProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  const profile = await getPortalProfile()
  const supabase = await createClient()
  const { data: documents } = user
    ? await supabase.from('portal_documents').select('id, name, mime_type, size_bytes, created_at, storage_path').eq('user_id', user.id).order('created_at', { ascending: false })
    : { data: [] }

  const homeName = profile?.home_name || 'Your home'
  return (
    <>
      <PageHeader
        crumb={`${homeName} / Dashboard`}
        title="Dashboard"
        description="Updates, deliveries, documents and pharmacy support for your home."
      />

      <dl className="mt-8 grid grid-cols-1 border border-hairline bg-paper sm:grid-cols-2">
        <div className="p-5">
          <dt className="eyebrow text-muted-foreground">Documents available</dt>
          <dd className="mt-3 text-3xl font-bold tracking-tight">{documents?.length ?? 0}</dd>
        </div>
        <div className="border-t border-hairline p-5 sm:border-l sm:border-t-0">
          <dt className="eyebrow text-muted-foreground">Account</dt>
          <dd className="mt-3 truncate text-sm font-medium">{user?.email}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <Card eyebrow="Private files" title="Documents from your administrator">
          {documents && documents.length > 0 ? (
            <ul className="divide-y divide-hairline border-y border-hairline">
              {documents.map((document) => (
                <li key={document.id} className="flex items-center gap-3 py-4">
                  <FileText className="size-5 shrink-0 text-forest" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{document.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Uploaded {new Date(document.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">Available in Policies</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-y border-dashed border-hairline py-10 text-center">
              <p className="text-sm font-medium">No documents yet</p>
              <p className="mt-2 text-sm text-muted-foreground">Your administrator has not published any files for this account.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
