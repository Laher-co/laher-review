import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db, decisions, messages, staff } from '@/lib/db'
import { getJobByCode, loadVersions, type FullVersion } from '@/lib/jobs'
import { formatSydney, versionTitle } from '@/lib/format'
import { areaLabel } from '@/lib/feedback'
import { jobStage, STAGE_COPY, type Stage } from '@/lib/stage'
import { Wordmark } from '@/components/brand'
import LightboxThumbs from '@/components/LightboxThumbs'
import Gallery from './Gallery'
import { ApproveButton, RequestChangesButton, RingSizeBar } from './client'
import MessageThread, { type ThreadMessage } from './messages'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your design — LAHER', robots: { index: false, follow: false } }

type Decision = typeof decisions.$inferSelect

export default async function CustomerReviewPage({ params }: { params: { code: string } }) {
  const row = await getJobByCode(params.code)
  if (!row) notFound()
  const { job, designerName } = row
  const [published, allDecisions, allMessages] = await Promise.all([
    loadVersions(job.id, { publishedOnly: true }),
    db.select().from(decisions).where(eq(decisions.jobId, job.id)).orderBy(asc(decisions.createdAt)),
    db.select({ m: messages, staffName: staff.name }).from(messages)
      .leftJoin(staff, eq(staff.id, messages.staffId))
      .where(eq(messages.jobId, job.id)).orderBy(asc(messages.createdAt)),
  ])
  const thread = (versionId: string | null): ThreadMessage[] => allMessages
    .filter(({ m }) => m.versionId === versionId)
    .map(({ m, staffName }) => ({
      id: m.id, author: m.author, staffName, body: m.body,
      drawings: m.annotations.map(a => a.drawingUrl), when: formatSydney(m.createdAt),
    }))
  const designer = designerName ?? 'Your designer'
  const firstName = job.customerName.split(' ')[0]
  const stage = jobStage({
    publishedAt: published.map(v => v.publishedAt),
    decisions: allDecisions,
    ringSizeStatus: job.ringSizeStatus,
  })
  const [latest, ...older] = published

  // Shared by every version section. Nothing here locks after a response:
  // customers can approve any version, request more changes, and (Phase 3)
  // message the studio at every stage.
  const section = (v: FullVersion, isLatest: boolean) => (
    <VersionSection key={v.id} version={v} latest={isLatest}
      decisions={allDecisions.filter(d => d.versionId === v.id)} messages={thread(v.id)}
      code={job.publicCode} designer={designer} ringSizeStatus={job.ringSizeStatus} />
  )

  return (
    <div className="min-h-screen bg-ivory font-inter text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark />
          <span className="text-[11px] uppercase tracking-[0.25em] text-stone">Design review</span>
        </div>
      </header>

      <StageBanner stage={stage} designer={designer} />
      <RingSizeBar code={job.publicCode} size={job.ringSize} status={job.ringSizeStatus} />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <p className="text-sm text-stone">Hi {firstName},</p>
        <h1 className="mt-1 font-serif text-[2rem] leading-tight text-cocoa-dark sm:text-4xl">Your bespoke design</h1>
        {designerName && <p className="mt-2 text-sm text-cocoa-light">Designed by {designerName}</p>}

        {!latest ? (
          <p className="mt-12 rounded-2xl border border-sand bg-white/60 px-6 py-12 text-center text-stone">
            Your designer is still preparing your renders. We’ll email you as soon as they’re ready.
          </p>
        ) : (
          <>
            {section(latest, true)}
            {older.length > 0 && (
              <div className="mt-16">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-cocoa-light">Earlier versions</h2>
                <div className="mt-3 space-y-3">
                  {older.map(v => (
                    <details key={v.id} className="group rounded-2xl border border-sand bg-white/50">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
                        <span className="font-serif text-xl text-cocoa-dark">{versionTitle(v.number)}</span>
                        <span className="flex items-center gap-3 text-xs text-stone">
                          {v.publishedAt && formatSydney(v.publishedAt, { hour: undefined, minute: undefined })}
                          <span className="text-lg text-cocoa-light transition-transform group-open:rotate-45">+</span>
                        </span>
                      </summary>
                      <div className="border-t border-sand px-4 pb-6 sm:px-5">{section(v, false)}</div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Always available: before, during and after approval */}
        <section className="mt-16" id="message-the-studio">
          <MessageThread code={job.publicCode} versionId={null} renders={[]} messages={thread(null)}
            heading="Have another thought? Message the studio"
            intro={`Questions, ideas or anything else. ${designer} and the studio team will reply here.`}
            placeholder="Write a message to the studio…" />
        </section>
      </main>
    </div>
  )
}

const STAGE_STYLE: Record<Stage, string> = {
  in_design:            'bg-linen text-cocoa-dark',
  feedback_needed:      'bg-cocoa text-ivory',
  alterations:          'bg-linen text-cocoa-dark',
  approved:             'bg-[#3F4A3A] text-ivory',
  approved_size_needed: 'bg-amber-800 text-white',
}

function StageBanner({ stage, designer }: { stage: Stage; designer: string }) {
  const copy = STAGE_COPY[stage]
  return (
    <div className={STAGE_STYLE[stage]} role="status">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-80">{copy.label}</p>
        <p className="mt-1 font-serif text-[1.45rem] leading-snug sm:text-[1.75rem]">{copy.message(designer)}</p>
      </div>
    </div>
  )
}

function VersionSection({ version: v, latest, decisions: ds, messages: msgs, code, designer, ringSizeStatus }: {
  version: FullVersion; latest: boolean; decisions: Decision[]; messages: ThreadMessage[]
  code: string; designer: string; ringSizeStatus: 'unconfirmed' | 'submitted' | 'confirmed'
}) {
  const multi = v.options.length > 1
  const title = versionTitle(v.number)
  return (
    <section id={`v${v.number}`} className={latest ? 'mt-10' : 'pt-4'}>
      {latest && (
        <div className="flex items-baseline justify-between gap-3 border-b border-sand pb-3">
          <h2 className="font-serif text-[1.9rem] leading-none text-cocoa-dark sm:text-[2.4rem]">{title}</h2>
          <span className="shrink-0 text-xs text-stone">
            Latest · {v.publishedAt ? formatSydney(v.publishedAt, { hour: undefined, minute: undefined }) : ''}
          </span>
        </div>
      )}
      {v.designerNote && (
        <p className="mt-4 whitespace-pre-line rounded-xl bg-linen px-4 py-3 text-[15px] leading-relaxed text-ink">{v.designerNote}</p>
      )}

      <div className="mt-5 space-y-12">
        {v.options.map(o => {
          const approvedHere = ds.some(d => d.decision === 'approved' && d.optionId === o.id)
          return (
            <div key={o.id}>
              {multi && (
                <h3 className="mb-3 flex items-center gap-2 font-serif text-xl text-cocoa">
                  Option {o.label}
                  {approvedHere && (
                    <span className="rounded-full bg-cocoa px-2.5 py-0.5 font-inter text-[11px] uppercase tracking-wider text-ivory">Approved</span>
                  )}
                </h3>
              )}
              <Gallery renders={o.renders.map(r => ({ id: r.id, url: r.blobUrl, width: r.width, height: r.height }))}
                alt={`${title}${multi ? `, Option ${o.label}` : ''}`} />
              <ApproveButton code={code} designer={designer} ringSizeStatus={ringSizeStatus}
                version={{ id: v.id, title }} optionCount={v.options.length}
                option={{ id: o.id, label: o.label, cover: o.renders[0]?.blobUrl ?? null }} />
            </div>
          )
        })}
      </div>

      <RequestChangesButton code={code} designer={designer} version={{ id: v.id, title }}
        options={v.options.map(o => ({ id: o.id, label: o.label, renders: o.renders.map(r => ({ id: r.id, url: r.blobUrl })) }))} />

      {ds.length > 0 && (
        <div className="mt-8 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-cocoa-light">Your responses to {title}</h3>
          {[...ds].reverse().map(d => <DecisionSummary key={d.id} decision={d} version={v} />)}
        </div>
      )}

      <div className="mt-8">
        <MessageThread code={code} versionId={v.id} messages={msgs}
          renders={v.options.flatMap(o => o.renders.map(r => ({ id: r.id, url: r.blobUrl })))}
          heading={`Comments on ${title}`}
          intro="Ask a question or leave a note about this version. You can draw on the design too."
          placeholder={`Write a comment about ${title}…`} />
      </div>
    </section>
  )
}

function DecisionSummary({ decision: d, version: v }: { decision: Decision; version: FullVersion }) {
  const option = v.options.find(o => o.id === d.optionId)
  const approved = d.decision === 'approved'
  const which = `${versionTitle(v.number)}${option && v.options.length > 1 ? `, Option ${option.label}` : ''}`
  const notes = d.changes.filter(c => c.note)
  return (
    <div className={`rounded-2xl border p-5 ${approved ? 'border-cocoa/30 bg-white' : 'border-sand bg-white/70'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cocoa-light">
        {approved ? (d.sizeOutstanding ? 'Approved – ring size to confirm' : 'Approved') : 'Changes requested'} · {formatSydney(d.createdAt)}
      </p>
      <p className="mt-2 font-serif text-xl text-cocoa-dark">
        {approved ? `You approved ${which}.` : `You asked for changes to ${which}.`}
      </p>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[15px]">
          {notes.map(c => <li key={c.area}><span className="font-medium text-cocoa">{areaLabel(c.area)}:</span> {c.note}</li>)}
        </ul>
      )}
      {d.comments && <p className="mt-3 whitespace-pre-line text-[15px] text-ink">{d.comments}</p>}
      {d.annotations.length > 0 && (
        <LightboxThumbs className="mt-4 grid grid-cols-3 gap-2" sizes="33vw"
          images={d.annotations.map((a, i) => ({ url: a.drawingUrl, alt: `Your drawing ${i + 1}`, caption: 'Your drawing' }))} />
      )}
    </div>
  )
}
