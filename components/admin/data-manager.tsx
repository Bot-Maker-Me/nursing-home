'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileUp, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { SECTION_MAP, SECTIONS, type SectionKey } from '@/lib/data-sections'
import { parseCsv } from '@/lib/csv'
import { useToast } from '@/components/common/toast'
import { cn } from '@/lib/utils'

export type Entity = { id: string; name: string }
type ScopeType = 'client' | 'pharmacy'

type RecordRow = { id: string; section: string; title: string; payload: Record<string, string>; created_at: string }
type Doc = { id: string; name: string; mime_type: string; size_bytes: number; section: string; url: string | null; created_at: string }

const field = 'h-10 w-full border border-hairline bg-cream px-3 text-sm focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20'

export function DataManager({ homes, pharmacies }: { homes: Entity[]; pharmacies: Entity[] }) {
  const toast = useToast()
  const [scopeType, setScopeType] = useState<ScopeType>('client')
  const [scopeId, setScopeId] = useState('')
  const [section, setSection] = useState<SectionKey>('policies')
  const [records, setRecords] = useState<RecordRow[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [detectedColumns, setDetectedColumns] = useState<string[]>([])
  const csvRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const options = scopeType === 'client' ? homes : pharmacies
  const def = SECTION_MAP[section]

  useEffect(() => {
    setScopeId((current) => (options.some((option) => option.id === current) ? current : options[0]?.id ?? ''))
  }, [options])

  useEffect(() => {
    setForm({})
    setDetectedColumns([])
  }, [section])

  const load = useCallback(async () => {
    if (!scopeId) {
      setRecords([])
      setDocs([])
      return
    }
    setLoading(true)
    const [recordsResponse, docsResponse] = await Promise.all([
      fetch(`/api/admin/records?scopeType=${scopeType}&scopeId=${scopeId}&section=${section}`),
      fetch(`/api/admin/documents?scopeType=${scopeType}&scopeId=${scopeId}&section=${section}`),
    ])
    setRecords(recordsResponse.ok ? await recordsResponse.json() : [])
    setDocs(docsResponse.ok ? await docsResponse.json() : [])
    setLoading(false)
  }, [scopeType, scopeId, section])

  useEffect(() => {
    void load()
  }, [load])

  const addRecord = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!scopeId) {
      toast.error('Select a client or pharmacy first.')
      return
    }
    const payload = Object.fromEntries(def.columns.map((column) => [column, (form[column] ?? '').trim()]).filter(([, value]) => value))
    if (Object.keys(payload).length === 0) {
      toast.error('Fill in at least one field.')
      return
    }
    setBusy(true)
    const response = await fetch('/api/admin/records', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType, scopeId, section, payload }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? 'Unable to save record.')
      setBusy(false)
      return
    }
    setRecords((current) => [data, ...current])
    setForm({})
    setBusy(false)
    toast.success('Record saved.')
  }

  const deleteRecord = async (id: string) => {
    if (!window.confirm('Delete this record?')) return
    const response = await fetch(`/api/admin/records?id=${id}`, { method: 'DELETE' })
    if (!response.ok) {
      toast.error('Unable to delete record.')
      return
    }
    setRecords((current) => current.filter((record) => record.id !== id))
    toast.success('Record deleted.')
  }

  const importCsv = async (file: File) => {
    if (!scopeId) {
      toast.error('Select a client or pharmacy first.')
      return
    }
    const { headers, rows } = parseCsv(await file.text())
    if (rows.length === 0) {
      toast.error('No data rows found in that file.')
      return
    }
    setDetectedColumns(headers)
    setBusy(true)
    const response = await fetch('/api/admin/records/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType, scopeId, section, rows }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(data?.error ?? 'Import failed.')
      setBusy(false)
      return
    }
    toast.success(`Imported ${data.inserted} rows into ${def.label}.`)
    setBusy(false)
    void load()
  }

  const downloadTemplate = () => {
    const blob = new Blob([`${def.columns.join(',')}\n`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${section}-template.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const uploadFiles = async (files: FileList) => {
    if (!scopeId) {
      toast.error('Select a client or pharmacy first.')
      return
    }
    const data = new FormData()
    Array.from(files).forEach((file) => data.append('files', file))
    data.set('scopeType', scopeType)
    data.set('scopeId', scopeId)
    data.set('section', section)
    setBusy(true)
    const response = await fetch('/api/admin/documents', { method: 'POST', body: data })
    const result = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(result?.error ?? 'Upload failed.')
      setBusy(false)
      return
    }
    toast.success(`Uploaded ${result.uploaded.length} file(s).`)
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    void load()
  }

  const deleteDoc = async (id: string) => {
    if (!window.confirm('Delete this file?')) return
    const response = await fetch(`/api/admin/documents?id=${id}`, { method: 'DELETE' })
    if (!response.ok) {
      toast.error('Unable to delete file.')
      return
    }
    setDocs((current) => current.filter((doc) => doc.id !== id))
    toast.success('File deleted.')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 border border-hairline bg-paper p-5 sm:grid-cols-[10rem_1fr]">
        <fieldset>
          <legend className="eyebrow text-muted-foreground">Scope</legend>
          <div className="mt-3 flex gap-2">
            {(['client', 'pharmacy'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setScopeType(type)}
                aria-pressed={scopeType === type}
                className={cn('h-10 flex-1 border text-sm font-medium', scopeType === type ? 'border-forest bg-forest text-cream' : 'border-hairline text-muted-foreground hover:bg-cream')}
              >
                {type === 'client' ? 'Client' : 'Pharmacy'}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="scope-select" className="eyebrow text-muted-foreground">Selected {scopeType === 'client' ? 'long-term care home' : 'pharmacy'}</label>
          <select id="scope-select" value={scopeId} onChange={(event) => setScopeId(event.target.value)} className={`${field} mt-3`}>
            {options.length === 0 && <option value="">No {scopeType === 'client' ? 'clients' : 'pharmacies'} yet</option>}
            {options.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            aria-pressed={section === item.key}
            className={cn('h-10 border px-4 text-sm font-medium', section === item.key ? 'border-forest bg-mint text-forest' : 'border-hairline text-muted-foreground hover:bg-cream')}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border border-hairline bg-paper p-6">
          <p className="eyebrow text-forest-soft/80">Add one record</p>
          <h3 className="mt-2 text-lg font-semibold">{def.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{def.description}</p>
          <form onSubmit={addRecord} className="mt-5 space-y-3">
            {def.columns.map((column) => (
              <div key={column}>
                <label htmlFor={`field-${column}`} className="mb-1 block text-xs font-medium capitalize">{column.replace(/_/g, ' ')}</label>
                <input
                  id={`field-${column}`}
                  value={form[column] ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, [column]: event.target.value }))}
                  className={field}
                />
              </div>
            ))}
            <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 bg-forest px-4 text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              Save record
            </button>
          </form>
        </section>

        <section className="border border-hairline bg-paper p-6">
          <p className="eyebrow text-forest-soft/80">Bulk import & files</p>
          <h3 className="mt-2 text-lg font-semibold">CSV upload + document files</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Expected columns: <span className="font-mono">{def.columns.join(', ')}</span>
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={downloadTemplate} className="inline-flex h-10 items-center gap-2 border border-hairline px-4 text-sm hover:bg-cream">
              <Download className="size-4" aria-hidden="true" />
              CSV template
            </button>
            <button type="button" onClick={() => csvRef.current?.click()} className="inline-flex h-10 items-center gap-2 bg-forest px-4 text-sm font-semibold text-cream hover:bg-forest-deep">
              <Upload className="size-4" aria-hidden="true" />
              Import CSV
            </button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.target.value = '' }} />
          </div>
          {detectedColumns.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">Last file columns: <span className="font-mono">{detectedColumns.join(', ')}</span></p>
          )}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files) }}
            className="mt-5 grid cursor-pointer place-items-center border border-dashed border-forest-soft/50 px-6 py-8 text-center hover:bg-mint"
          >
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-forest">
              <FileUp className="size-4" aria-hidden="true" />
              {busy ? 'Working…' : 'Drop policy/document files or choose them'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">PDF, Word, Excel or CSV · multiple files · max 25 MB each</p>
            <input ref={fileRef} type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => { if (event.target.files?.length) void uploadFiles(event.target.files) }} />
          </div>
        </section>
      </div>

      <section className="border border-hairline bg-paper p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-forest-soft/80">Saved records</p>
            <h3 className="mt-2 text-lg font-semibold">{def.label}</h3>
          </div>
          <span className="text-sm text-muted-foreground">{records.length} records</span>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : records.length === 0 ? (
          <p className="mt-4 border border-dashed border-hairline py-8 text-center text-sm text-muted-foreground">No records yet for this scope.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-y border-hairline text-left">
                  <th className="py-3 pr-4">Title</th>
                  <th className="py-3 pr-4">Details</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="py-3 pr-4 font-medium">{record.title}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {Object.entries(record.payload).filter(([key]) => key !== def.titleField).map(([key, value]) => `${key}: ${value}`).join(' · ') || '—'}
                    </td>
                    <td className="py-3 text-right">
                      <button type="button" onClick={() => deleteRecord(record.id)} aria-label="Delete record" className="text-terracotta hover:opacity-70">
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {docs.length > 0 && (
          <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{doc.name}</span>
                <span className="text-xs text-muted-foreground">{Math.round(doc.size_bytes / 1024)} KB</span>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-forest underline">Open</a>
                )}
                <button type="button" onClick={() => deleteDoc(doc.id)} aria-label="Delete file" className="text-terracotta hover:opacity-70">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
