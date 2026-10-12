import { FileText } from 'lucide-react'
import { BrandArcs } from '@/components/portal/brand-arcs'
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
      <div className="relative isolate overflow-hidden">
        <BrandArcs className="absolute inset-x-0 top-0 -z-10 h-48 w-full" />
        <PageHeader
          crumb={`${homeName} / Dashboard`}
          title="Dashboard"
          description="Updates, deliveries, documents and pharmacy support for your home."
        />
      </div>

      <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="panel p-6">
          <dt className="eyebrow text-muted-foreground">Documents available</dt>
          <dd className="mt-3 text-3xl font-bold tracking-tight">{documents?.length ?? 0}</dd>
        </div>
        <div className="panel p-6">
          <dt className="eyebrow text-muted-foreground">Account</dt>
          <dd className="mt-3 truncate text-sm font-medium">{user?.email}</dd>
        </div>
      </dl>

      <div className="mt-8">
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
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-card bg-brand-tint text-brand">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold">No documents yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">Your administrator has not published any files for this account.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
