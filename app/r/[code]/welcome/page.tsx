import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db, events, onboardingNotes, onboardingQuestions, versions } from '@/lib/db'
import { getJobByCode } from '@/lib/jobs'
import { formatSydney } from '@/lib/format'
import { SETTING_QUESTION, settingState } from '@/lib/setting'
import { getSettingImages } from '@/lib/setting-server'
import { firstNameOf, irregularClusterOn, onboardingProgress, sizeUnconfirmed, type SectionKey } from '@/lib/onboarding'
import { getClusterImages } from '@/lib/onboarding-server'
import { Wordmark } from '@/components/brand'
import SettingChooser from './setting-chooser'
import { ClusterChooser, DesignerNotes, RingSizeSection, StaffQuestions } from './sections'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Welcome to LAHER Bespoke', robots: { index: false, follow: false } }

const SECTION_LABEL: Record<SectionKey, string> = {
  size: 'Ring size', setting: 'Setting and wedding band', cluster: 'Irregular cluster', questions: 'Questions from our team',
}

export default async function OnboardingPage({ params }: { params: { code: string } }) {
  const row = await getJobByCode(params.code)
  if (!row) notFound()
  const { job } = row
  const [[{ n: published }], settingImages, clusterImages, questions, notes, [{ n: customerSized }]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(versions)
      .where(and(eq(versions.jobId, job.id), eq(versions.status, 'published'))),
    getSettingImages(),
    getClusterImages(),
    db.select().from(onboardingQuestions).where(eq(onboardingQuestions.jobId, job.id)).orderBy(asc(onboardingQuestions.createdAt)),
    db.select().from(onboardingNotes).where(eq(onboardingNotes.jobId, job.id)).orderBy(asc(onboardingNotes.createdAt)),
    // The size was confirmed by the customer (so it was unconfirmed when they started): still counts as a section
    db.select({ n: sql<number>`count(*)::int` }).from(events)
      .where(and(eq(events.jobId, job.id), eq(events.type, 'ring_size_confirmed'), sql`${events.details}->>'by' = 'customer'`)),
  ])
  const locked = published > 0
  const clusterOn = irregularClusterOn(job)
  const unconfirmed = sizeUnconfirmed(job.ringSizeStatus, job.ringSize)
  const progress = onboardingProgress({
    ringSizeStatus: unconfirmed ? 'unconfirmed' : 'confirmed', ringSizeNotSureAt: job.ringSizeNotSureAt,
    sizeConfirmedByCustomer: customerSized > 0,
    settingQuestion: job.settingQuestion, settingChoice: job.settingChoice, settingNotNeeded: job.settingNotNeeded,
    clusterOn, clusterSavedAt: job.clusterSavedAt, questions,
  })
  const doneOf = (k: SectionKey) => progress.sections.find(s => s.key === k)?.done ?? false
  const first = firstNameOf(job.customerName)
  const designPage = `/r/${job.publicCode}`
  const messageLink = `${designPage}#message-the-studio`
  const showSetting = job.settingQuestion && !job.settingNotNeeded

  return (
    <div className="min-h-screen bg-ivory font-inter text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark />
          <Link href={designPage} className="text-[11px] uppercase tracking-[0.25em] text-stone hover:text-cocoa">Your design page</Link>
        </div>
      </header>

      {progress.total > 0 && (
        <nav aria-label="Your progress" className="sticky top-0 z-10 border-b border-sand bg-ivory/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cocoa-light">
              {progress.done === progress.total ? 'All done – thank you' : `${progress.done} of ${progress.total} done`}
            </p>
            <ol className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {progress.sections.map(s => (
                <li key={s.key} className="shrink-0">
                  <a href={`#${s.key}`} className={`relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors
                    ${s.done ? 'border-[#3F4A3A]/30 bg-[#3F4A3A] text-ivory' : 'border-sand bg-white text-cocoa hover:border-cocoa/40'}`}>
                    {s.done ? <Tick className="h-3.5 w-3.5" /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cocoa-light" />}
                    {SECTION_LABEL[s.key]}<span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
        {/* 1. Welcome */}
        <section className="pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cocoa-light">Welcome to LAHER Bespoke</p>
          <h1 className="mt-2 font-serif text-[2rem] leading-tight text-cocoa-dark sm:text-[2.6rem]">
            Thank you for choosing LAHER{first ? `, ${first}` : ''}
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-ink">This is the exciting part: your ring is about to start taking shape. Here’s what happens next:</p>
          <ol className="mt-5 space-y-4">
            {[
              ['Design', 'Our designer creates detailed 3D renders of your piece. You’ll usually see your first designs within 7 days.'],
              ['Review', 'We’ll email you when they’re ready to view on your private design page, where you can request changes or approve.'],
              ['Make', 'Once approved, your ring is brought to life by our jewellers.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cocoa/30 font-serif text-lg text-cocoa">{i + 1}</span>
                <p className="pt-1 text-[15.5px] leading-relaxed"><span className="font-semibold text-cocoa-dark">{t}</span> – {d}</p>
              </li>
            ))}
          </ol>
          {progress.total > 0 && (
            <p className="mt-6 text-[15.5px] leading-relaxed text-ink">Before we begin, a few quick details help us get everything just right.</p>
          )}
        </section>

        {/* 2. Ring size */}
        <Section id="size" title="Your ring size" done={doneOf('size')} counted={progress.sections.some(s => s.key === 'size')}>
          <RingSizeSection code={job.publicCode} size={job.ringSize} unconfirmed={unconfirmed}
            notSure={!!job.ringSizeNotSureAt} messageLink={messageLink} />
        </Section>

        {/* 3. Setting and wedding band */}
        {showSetting && (
          <Section id="setting" title="Setting and wedding band" done={doneOf('setting')} counted>
            <p className="mt-2 font-serif text-[1.35rem] leading-snug text-cocoa">{SETTING_QUESTION}</p>
            <SettingChooser code={job.publicCode} initial={job.settingChoice}
              locked={settingState(job, published) === 'locked'}
              images={{ high_set: settingImages.high_set?.url ?? null, low_set: settingImages.low_set?.url ?? null }} />
          </Section>
        )}

        {/* 4. Irregular cluster */}
        {clusterOn && (
          <Section id="cluster" title="Irregular cluster" done={doneOf('cluster')} counted>
            <p className="mt-2 font-serif text-[1.35rem] leading-snug text-cocoa">Which irregular cluster style best suits your vision?</p>
            <p className="mt-1 text-[15px] text-stone">Choose as many as you like.</p>
            <ClusterChooser code={job.publicCode} initial={job.clusterStyles ?? []} saved={!!job.clusterSavedAt}
              locked={locked && !!job.clusterSavedAt}
              images={Object.fromEntries(Object.entries(clusterImages).map(([k, v]) => [k, v?.url ?? null]))} />
          </Section>
        )}

        {/* 5. Questions from the team */}
        {questions.length > 0 && (
          <Section id="questions" title="A few questions from our team" done={doneOf('questions')} counted>
            <StaffQuestions code={job.publicCode} locked={locked}
              questions={questions.map(q => ({ id: q.id, question: q.question, answer: q.answer }))} />
          </Section>
        )}

        {/* 6. Anything else */}
        <Section id="notes" title="Anything else for our designers?">
          <p className="mt-2 text-[15px] leading-relaxed text-stone">Tell us anything that will help: inspiration, must-haves, things to avoid.</p>
          <DesignerNotes code={job.publicCode}
            sent={notes.map(n => ({ id: n.id, body: n.body, photos: n.photos.map(p => p.url), when: formatSydney(n.createdAt) }))} />
        </Section>

        {/* 7. Questions */}
        <section className="mt-14 rounded-2xl border border-sand bg-white/60 px-5 py-6 text-center sm:px-6">
          <p className="font-serif text-xl text-cocoa-dark">Questions about anything?</p>
          <p className="mt-1 text-[15px] text-stone">
            <Link href={messageLink} className="text-cocoa underline underline-offset-4 hover:text-cocoa-dark">Message us here</Link>
            {' '}and we’ll get back to you.
          </p>
          <p className="mt-4 text-xs text-stone">You can leave this page and come back any time.</p>
        </section>
      </main>
    </div>
  )
}

function Tick({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  )
}

function Section({ id, title, done, counted, children }: {
  id: string; title: string; done?: boolean; counted?: boolean; children: React.ReactNode
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-28 border-t border-sand pt-10">
      <div className="flex items-center gap-3">
        <h2 className="font-serif text-[1.65rem] leading-tight text-cocoa-dark sm:text-3xl">{title}</h2>
        {counted && done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#3F4A3A] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-ivory">
            <Tick className="h-3 w-3" /> Done
          </span>
        )}
      </div>
      {children}
    </section>
  )
}
