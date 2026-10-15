import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db, decisions } from '@/lib/db'
import { getJobByCode, loadVersions, type FullVersion } from '@/lib/jobs'
import { formatSydney, versionTitle } from '@/lib/format'
import { areaLabel } from '@/lib/feedback'
import { Wordmark } from '@/components/brand'
import Gallery from './Gallery'
import { DecisionPanel, RingSizeBar } from './client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your design — LAHER', robots: { index: false, follow: false } }

type Decision = typeof decisions.$inferSelect

export default async function CustomerReviewPage({ params }: { params: { code: string } }) {
  const row = await getJobByCode(params.code)
  if (!row) notFound()
  const { job, designerName } = row
  const [published, allDecisions] = await Promise.all([
    loadVersions(job.id, { publishedOnly: true }),
    db.select().from(decisions).where(eq(decisions.jobId, job.id)).orderBy(asc(decisions.createdAt)),
  ])
  const decisionFor = (versionId: string) => allDecisions.find(d => d.versionId === versionId)
  const firstName = job.customerName.split(' ')[0]
  const designer = designerName ?? 'Your designer'
  const [latest, ...older] = published

  return (
    <div className="min-h-screen bg-ivory font-inter text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark />
          <span className="text-[11px] uppercase tracking-[0.25em] text-stone">Design review</span>
        </div>
      </header>

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
            <VersionSection version={latest} latest decision={decisionFor(latest.id)} />
            {!decisionFor(latest.id) && (
              <DecisionPanel
                code={job.publicCode}
                designer={designer}
                ringSizeConfirmed={job.ringSizeStatus === 'confirmed'}
                version={{ id: latest.id, title: versionTitle(latest.number) }}
                options={latest.options.map(o => ({
                  id: o.id, label: o.label,
                  renders: o.renders.map(r => ({ id: r.id, url: r.blobUrl })),
                }))}
              />
            )}

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
                      <div className="border-t border-sand px-4 pb-6 sm:px-5">
                        <VersionSection version={v} decision={decisionFor(v.id)} />
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function VersionSection({ version: v, latest, decision }: { version: FullVersion; latest?: boolean; decision?: Decision }) {
  const multi = v.options.length > 1
  return (
    <section id={`v${v.number}`} className={latest ? 'mt-10' : 'pt-4'}>
      {latest && (
        <div className="flex items-baseline justify-between gap-3 border-b border-sand pb-3">
          <h2 className="font-serif text-[1.9rem] leading-none text-cocoa-dark sm:text-[2.4rem]">{versionTitle(v.number)}</h2>
          <span className="shrink-0 text-xs text-stone">
            Latest · {v.publishedAt ? formatSydney(v.publishedAt, { hour: undefined, minute: undefined }) : ''}
          </span>
        </div>
      )}
      {v.designerNote && (
        <p className="mt-4 whitespace-pre-line rounded-xl bg-linen px-4 py-3 text-[15px] leading-relaxed text-ink">{v.designerNote}</p>
      )}
      <div className="mt-5 space-y-10">
        {v.options.map(o => (
          <div key={o.id}>
            {multi && (
              <h3 className="mb-3 flex items-center gap-2 font-serif text-xl text-cocoa">
                Option {o.label}
                {decision?.decision === 'approved' && decision.optionId === o.id && (
                  <span className="rounded-full bg-cocoa px-2.5 py-0.5 font-inter text-[11px] uppercase tracking-wider text-ivory">Your choice</span>
                )}
              </h3>
            )}
            <Gallery renders={o.renders.map(r => ({ id: r.id, url: r.blobUrl, width: r.width, height: r.height }))}
              alt={`${versionTitle(v.number)}${multi ? `, Option ${o.label}` : ''}`} />
          </div>
        ))}
      </div>
      {decision && <DecisionSummary decision={decision} version={v} />}
    </section>
  )
}

function DecisionSummary({ decision: d, version: v }: { decision: Decision; version: FullVersion }) {
  const option = v.options.find(o => o.id === d.optionId)
  const approved = d.decision === 'approved'
  return (
    <div className={`mt-8 rounded-2xl border p-5 ${approved ? 'border-cocoa/30 bg-white' : 'border-sand bg-white/70'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cocoa-light">
        {approved ? 'Approved' : 'Changes requested'} · {formatSydney(d.createdAt)}
      </p>
      <p className="mt-2 font-serif text-xl text-cocoa-dark">
        {approved
          ? `You approved ${versionTitle(v.number)}${option && v.options.length > 1 ? `, Option ${option.label}` : ''}.`
          : 'Thanks, your designer is working on your next version.'}
      </p>
      {!approved && option && v.options.length > 1 && (
        <p className="mt-1 text-sm text-stone">Closest option: Option {option.label}</p>
      )}
      {d.changes.filter(c => c.note).length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[15px]">
          {d.changes.filter(c => c.note).map(c => (
            <li key={c.area}><span className="font-medium text-cocoa">{areaLabel(c.area)}:</span> {c.note}</li>
          ))}
        </ul>
      )}
      {d.comments && <p className="mt-3 whitespace-pre-line text-[15px] text-ink">{d.comments}</p>}
      {d.annotations.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {d.annotations.map(a => (
            <a key={a.drawingUrl} href={a.drawingUrl} target="_blank" rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-sand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.drawingUrl} alt="Your drawing" className="h-auto w-full" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
