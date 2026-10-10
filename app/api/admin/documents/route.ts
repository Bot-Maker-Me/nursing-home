import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ayvpdpthxwplbsmhpbva.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase() === 'admin' ? user : null
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('portal_documents')
    .select('id, name, mime_type, size_bytes, created_at, storage_path')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load documents.' }, { status: 500 })

  const documents = await Promise.all(data.map(async (document) => {
    const { data: signed } = await supabase.storage.from('portal-documents').createSignedUrl(document.storage_path, 300)
    return { ...document, url: signed?.signedUrl ?? null }
  }))
  return NextResponse.json(documents)
}

export async function POST(request: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'Files must be 25 MB or smaller.' }, { status: 400 })
  const targetUserId = String(form.get('userId') ?? '').trim()
  if (!targetUserId) return NextResponse.json({ error: 'Select a portal user.' }, { status: 400 })
  const path = `${targetUserId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  const { error: uploadError } = await getAdminClient().storage.from('portal-documents').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadError) return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  const { data, error } = await getAdminClient().from('portal_documents').insert({ user_id: targetUserId, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size }).select('id, name, created_at').single()
  if (error) return NextResponse.json({ error: 'File uploaded but could not be linked.' }, { status: 500 })
  return NextResponse.json(data)
}
