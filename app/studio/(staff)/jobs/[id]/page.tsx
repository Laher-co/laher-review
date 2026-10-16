import { notFound } from 'next/navigation'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db, decisions, escalations, events, messages, staff, waiting } from '@/lib/db'
import { getJob, loadVersions, reviewUrl } from '@/lib/jobs'
import { cardHasLabel, getCard, LABEL_DO_NOT_EMAIL } from '@/lib/trello'
import { formatSydney, versionTitle } from '@/lib/format'
import { areaLabel, decisionHeading } from '@/lib/feedback'
import { Badge } from '@/components/brand'
import { CopyLink, DraftVersion, NewVersionButton, QueuePanel, RingSizeControl, StaffThread, type StaffThreadMessage } from './client'
import { addWorkingMinutes, formatMinutes, workingMinutesBetween } from '@/lib/working-hours'
import { OVERDUE_WORKING_MINUTES } from '@/lib/alerts'
import LightboxThumbs from '@/components/LightboxThumbs'

export const metadata = { title: 'Job — LAHER Studio' }

export default async function JobPage({ params }: { params: { id: string } }) {
  const row = await getJob(params.id).catch(() => null)
  if (!row) notFound()
  const { job, designerName } = row

  const [allVersions, people, card, jobEvents, jobDecisions, jobMessages, [openWait], [openEscalation]] = await Promise.all([
    loadVersions(job.id),
    db.select({ id: staff.id, name: staff.name }).from(staff),
    // Read live so a "Do not email" label added in Trello shows straight away
    getCard(job.trelloCardId).catch(() => null),
    db.select({ type: events.type, details: events.details }).from(events)
      .where(and(eq(events.jobId, job.id), inArray(events.type, ['version_published', 'design_approved', 'changes_requested']))),
    db.select().from(decisions).where(eq(decisions.jobId, job.id)),
    db.select().from(messages).where(eq(messages.jobId, job.id)).orderBy(asc(messages.createdAt)),
    db.select().from(waiting).where(and(eq(waiting.jobId, job.id), isNull(waiting.answeredAt))),
    db.select().from(escalations).where(and(eq(escalations.jobId, job.id), isNull(escalations.resolvedAt))),
  ])
  const now = new Date()
  const WAITING_FOR = { message: 'a reply to a message', decision: 'a response to their feedback', ring_size: 'their ring size to be confirmed' } as const
  const thread = (versionId: string | null): StaffThreadMessage[] => jobMessages
    .filter(m => m.versionId === versionId)
    .map(m => ({
      id: m.id, author: m.author, staffName: m.staffId ? people.find(p => p.id === m.staffId)?.name ?? null : null,
      body: m.body, drawings: m.annotations.map(a => a.drawingUrl), when: formatSydney(m.createdAt),
    }))
  // What happened on Trello when each version was published / answered
  type Outcome = { moved: boolean; from?: string; to?: string; reason?: string }
  const outcome = (types: string[]) => new Map(jobEvents.filter(e => types.includes(e.type)).map(e => {
    const d = e.details as { number?: number; version?: number; trello?: Outcome }
    return [d.number ?? d.version, d.trello] as const
  }))
  const publishOutcome  = outcome(['version_published'])
  // Each response's Trello outcome, keyed by decision id
  const decisionOutcome = new Map(jobEvents
    .filter(e => e.type === 'design_approved' || e.type === 'changes_requested')
    .map(e => {
      const d = e.details as { decisionId?: string; trello?: Outcome }
      return [d.decisionId, d.trello] as const
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
          </div>
        </div>
        {job.status === 'approved_size_needed' && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Approved – size outstanding.</strong> The customer approved but isn’t sure of their ring size.
            Confirming a size below moves the Trello card to Print Ready.
          </p>
        )}
        <RingSizeControl jobId={job.id} size={job.ringSize} status={job.ringSizeStatus}
          confirmedBy={job.ringSizeConfirmedBy ? nameOf(job.ringSizeConfirmedBy) : null}
          confirmedAt={job.ringSizeConfirmedAt ? formatSydney(job.ringSizeConfirmedAt) : null} />
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

      <QueuePanel jobId={job.id}
        waitingFor={openWait ? WAITING_FOR[openWait.reason] : null}
        waitedLabel={openWait ? formatMinutes(workingMinutesBetween(openWait.waitingSince, now)) : null}
        overdue={!!openWait && addWorkingMinutes(openWait.waitingSince, OVERDUE_WORKING_MINUTES) <= now}
        escalation={openEscalation ? {
          id: openEscalation.id, note: openEscalation.note,
          by: nameOf(openEscalation.raisedBy), when: formatSydney(openEscalation.raisedAt),
        } : null} />

      {/* General conversation (not tied to a version) */}
      <StaffThread jobId={job.id} versionId={null} title="General messages" customerName={job.customerName} messages={thread(null)} />

      {/* Draft being prepared */}
      {draft
        ? <DraftVersion jobId={job.id} version={draft} title={versionTitle(draft.number)} doNotEmail={doNotEmail} />
        : <NewVersionButton jobId={job.id} label={`Start ${versionTitle(nextNumber)}`} />}

      {/* Until customer emails switch on (Phase 4), staff send the link themselves */}
      {published.length > 0 && !draft && !jobDecisions.some(d => d.versionId === published[0].id) && (
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
        const t = publishOutcome.get(v.number)
        const ds = jobDecisions.filter(x => x.versionId === v.id)
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
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
          {ds.map(d => (
            <DecisionCard key={d.id} decision={d} options={v.options} versionNumber={v.number} trello={decisionOutcome.get(d.id)} />
          ))}
          {v.designerNote && <p className="mt-4 whitespace-pre-line text-sm text-ink"><span className="text-stone">Note to customer: </span>{v.designerNote}</p>}
          <div className="mt-4">
            <StaffThread jobId={job.id} versionId={v.id} title={`Comments on ${versionTitle(v.number)}`}
              customerName={job.customerName} messages={thread(v.id)} />
          </div>
          <div className="mt-4 space-y-4">
            {v.options.map(o => (
              <div key={o.id}>
                {v.options.length > 1 && <p className="mb-2 text-xs uppercase tracking-widest text-cocoa-light">Option {o.label}</p>}
                <LightboxThumbs images={o.renders.map((r, i) => ({
                  url: r.blobUrl, alt: `${versionTitle(v.number)} Option ${o.label} render ${i + 1}`,
                  caption: `${versionTitle(v.number)}${v.options.length > 1 ? `, Option ${o.label}` : ''}`,
                }))} />
              </div>
            ))}
          </div>
        </section>
        )
      })}
    </div>
  )
}

type DecisionRow = typeof decisions.$inferSelect

function TrelloLine({ t }: { t?: { moved: boolean; from?: string; to?: string; reason?: string } }) {
  if (!t) return null
  return (
    <p className={`mt-1 text-xs ${t.moved ? 'text-stone' : 'font-medium text-amber-800'}`}>
      {!t.moved
        ? `Trello card not moved: ${t.reason}. Please move it by hand.`
        : t.from === t.to ? `Trello card already in “${t.to}”.` : `Trello card moved to “${t.to}”.`}
    </p>
  )
}

function DecisionCard({ decision: d, options, versionNumber, trello }: {
  decision: DecisionRow; options: { id: string; label: string }[]; versionNumber: number
  trello?: { moved: boolean; from?: string; to?: string; reason?: string }
}) {
  const approved = d.decision === 'approved'
  const option = options.find(o => o.id === d.optionId)
  const notes = d.changes.filter(c => c.note)
  const heading = decisionHeading({
    decision: d.decision, sizeOutstanding: d.sizeOutstanding, versionTitle: versionTitle(versionNumber),
    optionLabel: option?.label, optionCount: options.length,
  })
  const tone = !approved ? 'border-amber-200 bg-amber-50/60' : d.sizeOutstanding ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50/60'
  return (
    <div className={`mt-4 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-semibold tracking-wide text-ink">{heading}</p>
        <span className="ml-auto text-xs text-stone">{formatSydney(d.createdAt)}</span>
      </div>
      <TrelloLine t={trello} />
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {notes.map(c => <li key={c.area}><strong className="text-cocoa">{areaLabel(c.area)}:</strong> {c.note}</li>)}
        </ul>
      )}
      {d.comments && <p className="mt-2 whitespace-pre-line text-sm text-ink">“{d.comments}”</p>}
      {d.annotations.length > 0 && (
        <LightboxThumbs className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5"
          images={d.annotations.map((a, i) => ({ url: a.drawingUrl, alt: `Customer drawing ${i + 1}`, caption: heading }))} />
      )}
    </div>
  )
}
