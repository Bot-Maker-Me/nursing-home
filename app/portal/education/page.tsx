import { PageHeader } from '@/components/portal/page-header'
import { EducationResources, type Resource } from '@/components/portal/education-resources'
import { getPortalProfile } from '@/lib/auth'
import { educationResources } from '@/lib/sample-data'
import { createClient } from '@/lib/supabase/server'

type RecordRow = { id: string; title: string; payload: Record<string, string> | null }

export default async function EducationPage() {
  const profile = await getPortalProfile()
  const homeName = profile?.home_name || 'Your home'
  const homeId = profile?.home_id ?? null
  const supabase = await createClient()

  const resources: Resource[] = educationResources.map((resource) => ({ ...resource }))

  if (homeId) {
    const [recordsResponse, documentsResponse] = await Promise.all([
      supabase
        .from('managed_records')
        .select('id, title, payload')
        .eq('section', 'education')
        .eq('home_id', homeId)
        .order('created_at', { ascending: false }),
      supabase
        .from('portal_documents')
        .select('id, name, mime_type, storage_path')
        .eq('section', 'education')
        .eq('home_id', homeId)
        .order('created_at', { ascending: false }),
    ])

    for (const record of (recordsResponse.data ?? []) as RecordRow[]) {
      const payload = record.payload ?? {}
      const url = String(payload.url ?? '').trim()
      if (!url) continue
      const rawType = String(payload.type ?? '').toLowerCase()
      const type: Resource['type'] = rawType === 'video' ? 'video' : rawType === 'pdf' ? 'pdf' : 'link'
      resources.push({
        id: record.id,
        title: record.title || String(payload.title ?? '') || 'Untitled resource',
        type,
        url,
        description: String(payload.description ?? ''),
        category: String(payload.category ?? 'From your administrator'),
      })
    }

    for (const document of documentsResponse.data ?? []) {
      const { data: signed } = await supabase.storage
        .from('portal-documents')
        .createSignedUrl(document.storage_path, 3600)
      if (!signed?.signedUrl) continue
      resources.push({
        id: document.id,
        title: document.name,
        type: document.mime_type?.startsWith('video') ? 'video' : 'pdf',
        url: signed.signedUrl,
        description: 'Uploaded by your administrator',
        category: 'Document',
      })
    }
  }

  return (
    <>
      <PageHeader
        crumb={`${homeName} / Education & Training`}
        title="Education & Training Resources"
        description="Training videos, guides and reference documents for your care team. Videos play inline."
      />
      <EducationResources resources={resources} />
    </>
  )
}
