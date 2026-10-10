import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.JWT_2
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role ?? user.app_metadata?.role ?? '').toLowerCase()
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user }
}

export async function GET(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const url = new URL(request.url)
  const scopeType = url.searchParams.get('scopeType') === 'pharmacy' ? 'pharmacy' : 'client'
  const scopeId = url.searchParams.get('scopeId') ?? ''
  const section = url.searchParams.get('section') ?? ''
  if (!scopeId) return NextResponse.json({ error: 'Select a client or pharmacy first.' }, { status: 400 })

  const column = scopeType === 'pharmacy' ? 'pharmacy_id' : 'home_id'
  let query = result.supabase
    .from('portal_documents')
    .select('id, name, mime_type, size_bytes, section, storage_path, created_at')
    .eq(column, scopeId)
    .order('created_at', { ascending: false })
  if (section) query = query.eq('section', section)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Unable to load documents.' }, { status: 503 })

  const documents = await Promise.all(
    (data ?? []).map(async (document) => {
      const { data: signed } = await result.supabase.storage.from('portal-documents').createSignedUrl(document.storage_path, 300)
      return { ...document, url: signed?.signedUrl ?? null }
    }),
  )
  return NextResponse.json(documents)
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const service = serviceClient()
  if (!service) return NextResponse.json({ error: 'File storage is not configured on the server.' }, { status: 503 })

  const form = await request.formData()
  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File)
  const scopeType = form.get('scopeType') === 'pharmacy' ? 'pharmacy' : 'client'
  const scopeId = String(form.get('scopeId') ?? '').trim()
  const section = String(form.get('section') ?? 'policies').trim() || 'policies'

  if (files.length === 0) return NextResponse.json({ error: 'Choose at least one file.' }, { status: 400 })
  if (!scopeId) return NextResponse.json({ error: 'Select a client or pharmacy first.' }, { status: 400 })

  const oversized = files.find((file) => file.size > 25 * 1024 * 1024)
  if (oversized) return NextResponse.json({ error: `“${oversized.name}” is larger than 25 MB.` }, { status: 400 })

  const column = scopeType === 'pharmacy' ? 'pharmacy_id' : 'home_id'
  const folder = `${scopeType}/${scopeId}`
  const uploaded: string[] = []

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${folder}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await service.storage
      .from('portal-documents')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploadError) {
      return NextResponse.json({ error: `Upload failed for “${file.name}”.`, uploaded }, { status: 500 })
    }
    const { error: insertError } = await service.from('portal_documents').insert({
      [column]: scopeId,
      section,
      name: file.name,
      storage_path: path,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
    })
    if (insertError) {
      return NextResponse.json({ error: `“${file.name}” uploaded but could not be linked.`, uploaded }, { status: 500 })
    }
    uploaded.push(file.name)
  }

  return NextResponse.json({ uploaded })
}

export async function DELETE(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error

  const service = serviceClient()
  if (!service) return NextResponse.json({ error: 'File storage is not configured on the server.' }, { status: 503 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'A document id is required.' }, { status: 400 })

  const { data: document } = await service.from('portal_documents').select('storage_path').eq('id', id).maybeSingle()
  if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })

  await service.storage.from('portal-documents').remove([document.storage_path])
  const { error } = await service.from('portal_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Unable to delete the document.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
