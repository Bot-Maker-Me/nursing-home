'use client'

import { ExternalLink, FileText, PlayCircle } from 'lucide-react'

export type Resource = {
  id: string
  title: string
  type: 'video' | 'pdf' | 'link'
  url: string
  description: string
  category: string
}

/** Turns a video URL (YouTube, Vimeo or a direct file) into an inline embed. */
function embed(url: string): { kind: 'iframe' | 'video'; src: string } | null {
  const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/)
  if (youtube) return { kind: 'iframe', src: `https://www.youtube.com/embed/${youtube[1]}` }
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` }
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i.test(url)) return { kind: 'video', src: url }
  return null
}

function VideoResource({ resource }: { resource: Resource }) {
  const player = embed(resource.url)
  return (
    <section className="border border-hairline bg-paper">
      <div className="aspect-video w-full bg-forest-deep">
        {player?.kind === 'iframe' ? (
          <iframe
            src={player.src}
            title={resource.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="size-full"
          />
        ) : player?.kind === 'video' ? (
          <video src={player.src} controls playsInline className="size-full" />
        ) : (
          <a
            href={resource.url}
            target="_blank"
            rel="noreferrer"
            className="grid size-full place-items-center text-sm font-semibold text-cream hover:underline"
          >
            <span className="inline-flex items-center gap-2">
              <PlayCircle className="size-5" aria-hidden="true" />
              Watch “{resource.title}”
            </span>
          </a>
        )}
      </div>
      <div className="p-5">
        <p className="eyebrow text-forest-soft/80">{resource.category}</p>
        <h3 className="mt-2 font-semibold">{resource.title}</h3>
        {resource.description && <p className="mt-1 text-sm text-muted-foreground">{resource.description}</p>}
      </div>
    </section>
  )
}

export function EducationResources({ resources }: { resources: Resource[] }) {
  const videos = resources.filter((resource) => resource.type === 'video')
  const documents = resources.filter((resource) => resource.type !== 'video')

  return (
    <div className="mt-8 space-y-10">
      {videos.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Video training</h2>
          <p className="mt-1 text-sm text-muted-foreground">Videos play right here — no need to open another website.</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            {videos.map((resource) => (
              <VideoResource key={resource.id} resource={resource} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Guides, links & documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">Downloadable policies and reference links for your team.</p>
        {documents.length === 0 ? (
          <p className="mt-5 border border-dashed border-hairline py-10 text-center text-sm text-muted-foreground">
            No guides or documents have been published yet.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-hairline border border-hairline bg-paper">
            {documents.map((resource) => (
              <li key={resource.id}>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-16 items-center gap-4 px-5 py-4 hover:bg-cream"
                >
                  <span className="grid size-10 shrink-0 place-items-center bg-mint text-forest">
                    {resource.type === 'pdf' ? (
                      <FileText className="size-5" aria-hidden="true" />
                    ) : (
                      <ExternalLink className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{resource.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {resource.description || resource.category}
                    </span>
                  </span>
                  <span className="eyebrow shrink-0 text-forest-soft/80">{resource.type === 'pdf' ? 'PDF' : 'Link'}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
