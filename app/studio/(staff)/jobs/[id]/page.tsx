import Image from 'next/image'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db, events, staff } from '@/lib/db'
import { getJob, loadVersions, reviewUrl } from '@/lib/jobs'
import { cardHasLabel, getCard, LABEL_DO_NOT_EMAIL } from '@/lib/trello'
import { formatSydney, versionTitle } from '@/lib/format'
import { Badge } from '@/components/brand'
import { CopyLink, DraftVersion, NewVersionButton } from './client'

export const metadata = { title: 'Job — LAHER Studio' }

export default async function JobPage({ params }: { params: { id: string } }) {
  const row = await getJob(params.id).catch(() => null)
  if (!row) notFound()
  const { job, designerName } = row

  const [allVersions, people, card, publishEvents] = await Promise.all([
    loadVersions(job.id),
    db.select({ id: staff.id, name: staff.name }).from(staff),
    // Read live so a "Do not email" label added in Trello shows straight away
    getCard(job.trelloCardId).catch(() => null),
    db.select({ details: events.details }).from(events)
      .where(and(eq(events.jobId, job.id), eq(events.type, 'version_published'))),
  ])
  // What happened on Trello when each version was published
  const trelloOutcome = new Map(publishEvents.map(e => {
    const d = e.details as { number?: number; trello?: { moved: boolean; from?: string; to?: string; reason?: string } }
    return [d.number, d.trello] as const
  }))
  const nameOf = (id: string | null) => people.find(p => p.id === id)?.name ?? '—'
  const draft = allVersions.find(v => v.status === 'draft')
  const published = allVersions.filter(v => v.status === 'published')
  const doNotEmail = card ? cardHasLabel(card, LABEL_DO_NOT_EMAIL) : false
  const nextNumber = (allVersions[0]?.number ?? 0) + 1

  return (
    <div className="space-y-8">
      {/* Job header */}
      <section className="rounded-2xl border border-sand bg-white/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl text-cocoa-dark">{job.customerName}</h1>
            <p className="mt-1 text-sm text-stone">{job.customerEmail}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {doNotEmail && <Badge tone="danger">Do not email</Badge>}
            <Badge tone={job.ringSizeStatus === 'confirmed' ? 'ok' : 'warn'}>
              Size {job.ringSize ?? '—'} · {job.ringSizeStatus}
            </Badge>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-widest text-cocoa-light">Designer</dt>
            <dd className="mt-1 text-ink">{designerName ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-cocoa-light">Trello</dt>
            <dd className="mt-1">
              {job.trelloShortUrl
                ? <a href={job.trelloShortUrl} target="_blank" rel="noreferrer" className="text-cocoa underline">{job.title ?? 'Open card'}</a>
                : job.trelloCardId}
              {!card && <span className="ml-2 text-xs text-red-700">(couldn’t reach Trello)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-cocoa-light">Customer link</dt>
            <dd className="mt-1"><CopyLink url={reviewUrl(job)} /></dd>
          </div>
        </dl>
      </section>

      {/* Draft being prepared */}
      {draft
        ? <DraftVersion jobId={job.id} version={draft} title={versionTitle(draft.number)} doNotEmail={doNotEmail} />
        : <NewVersionButton jobId={job.id} label={`Start ${versionTitle(nextNumber)}`} />}

      {/* Until customer emails switch on (Phase 4), staff send the link themselves */}
      {published.length > 0 && !draft && (
        <section className="rounded-2xl border border-cocoa/20 bg-linen p-5">
          <p className="text-sm text-ink">
            <strong>{versionTitle(published[0].number)}</strong> is live. Customer emails aren’t switched on yet,
            so please send the customer this link:
          </p>
          <div className="mt-3 rounded-lg border border-sand bg-white px-3 py-2.5 text-sm"><CopyLink url={reviewUrl(job)} /></div>
        </section>
      )}

      {/* Published history, newest first */}
      {published.map(v => {
        const t = trelloOutcome.get(v.number)
        return (
        <section key={v.id} className="rounded-2xl border border-sand bg-white/50 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-2xl text-cocoa-dark">{versionTitle(v.number)}</h2>
            <p className="text-xs text-stone">
              Published {v.publishedAt ? formatSydney(v.publishedAt) : ''} by {nameOf(v.publishedBy)}
            </p>
          </div>
          {t && (
            <p className={`mt-1 text-xs ${t.moved ? 'text-stone' : 'font-medium text-amber-800'}`}>
              {!t.moved
                ? `Trello card not moved: ${t.reason}. Please move it by hand.`
                : t.from === t.to ? `Trello card already in “${t.to}”.` : `Trello card moved to “${t.to}”.`}
            </p>
          )}
          {v.designerNote && <p className="mt-2 whitespace-pre-line text-sm text-ink">{v.designerNote}</p>}
          <div className="mt-4 space-y-4">
            {v.options.map(o => (
              <div key={o.id}>
                {v.options.length > 1 && <p className="mb-2 text-xs uppercase tracking-widest text-cocoa-light">Option {o.label}</p>}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {o.renders.map(r => (
                    <a key={r.id} href={r.blobUrl} target="_blank" rel="noreferrer"
                      className="relative block aspect-square overflow-hidden rounded-lg border border-sand bg-linen">
                      <Image src={r.blobUrl} alt="" fill sizes="(min-width: 640px) 200px, 33vw" className="object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        )
      })}
    </div>
  )
}
