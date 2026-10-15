import { notFound } from 'next/navigation'
import { getJobByCode, loadVersions } from '@/lib/jobs'
import { formatSydney, versionTitle } from '@/lib/format'
import { Wordmark } from '@/components/brand'
import Gallery from './Gallery'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your design — LAHER', robots: { index: false, follow: false } }

export default async function CustomerReviewPage({ params }: { params: { code: string } }) {
  const row = await getJobByCode(params.code)
  if (!row) notFound()
  const { job, designerName } = row
  const published = await loadVersions(job.id, { publishedOnly: true })
  const firstName = job.customerName.split(' ')[0]

  return (
    <div className="min-h-screen bg-ivory font-inter text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark />
          <span className="text-[11px] uppercase tracking-[0.25em] text-stone">Design review</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <p className="text-sm text-stone">Hi {firstName},</p>
        <h1 className="mt-1 font-serif text-[2rem] leading-tight text-cocoa-dark sm:text-4xl">Your bespoke design</h1>
        {designerName && (
          <p className="mt-2 text-sm text-cocoa-light">Designed by {designerName}</p>
        )}

        {published.length === 0 ? (
          <p className="mt-12 rounded-2xl border border-sand bg-white/60 px-6 py-12 text-center text-stone">
            Your designer is still preparing your renders. We’ll email you as soon as they’re ready.
          </p>
        ) : (
          <div className="mt-10 space-y-16">
            {published.map((v, i) => (
              <section key={v.id} id={`v${v.number}`} className={i > 0 ? 'opacity-95' : ''}>
                <div className="flex items-baseline justify-between gap-3 border-b border-sand pb-3">
                  <h2 className="font-serif text-[1.9rem] leading-none text-cocoa-dark sm:text-[2.4rem]">{versionTitle(v.number)}</h2>
                  <span className="shrink-0 text-xs text-stone">
                    {i === 0 ? 'Latest · ' : ''}{v.publishedAt ? formatSydney(v.publishedAt, { hour: undefined, minute: undefined }) : ''}
                  </span>
                </div>
                {v.designerNote && (
                  <p className="mt-4 whitespace-pre-line rounded-xl bg-linen px-4 py-3 text-[15px] leading-relaxed text-ink">
                    {v.designerNote}
                  </p>
                )}
                <div className="mt-5 space-y-10">
                  {v.options.map(o => (
                    <div key={o.id}>
                      {v.options.length > 1 && (
                        <h3 className="mb-3 font-serif text-xl text-cocoa">Option {o.label}</h3>
                      )}
                      <Gallery renders={o.renders.map(r => ({ id: r.id, url: r.blobUrl, width: r.width, height: r.height }))}
                        alt={`${versionTitle(v.number)}${v.options.length > 1 ? `, Option ${o.label}` : ''}`} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
