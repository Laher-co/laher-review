import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getJobByCode } from '@/lib/jobs'
import { SETTING_QUESTION } from '@/lib/setting'
import { firstNameOf, type SectionKey } from '@/lib/onboarding'
import { loadOnboarding } from '@/lib/onboarding-view'
import { SpacedHeading, Wordmark } from '@/components/brand'
import SettingChooser from './setting-chooser'
import { ClusterChooser, DesignerNotes, RingSizeSection, StaffQuestions } from './sections'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Welcome to LAHER Bespoke', robots: { index: false, follow: false } }

const SECTION_LABEL: Record<SectionKey, string> = {
  size: 'Ring size', setting: 'Setting', cluster: 'Cluster style', questions: 'Questions',
}

export default async function OnboardingPage({ params }: { params: { code: string } }) {
  const row = await getJobByCode(params.code)
  if (!row) notFound()
  const { job } = row
  const ob = await loadOnboarding(job)
  // Once Version One is out, the brief lives in a panel on the design page
  if (ob.published > 0) redirect(`/r/${job.publicCode}?brief=open`)
  const { progress, locked, clusterOn, unconfirmed, showSetting, questions, notes } = ob
  const doneOf = (k: SectionKey) => progress.sections.find(s => s.key === k)?.done ?? false
  const first = firstNameOf(job.customerName)
  const designPage = `/r/${job.publicCode}`
  const messageLink = `${designPage}#message-the-studio`

  return (
    <div className="min-h-screen bg-ivory font-inter text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark />
          <Link href={designPage} className="text-[11px] uppercase tracking-[0.25em] text-stone hover:text-cocoa">Your design</Link>
        </div>
      </header>

      {progress.total > 0 && (
        <nav aria-label="Your progress" className="sticky top-0 z-10 border-b border-sand bg-ivory/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cocoa-light">
              {progress.done === progress.total ? 'All done, thank you' : `${progress.done} of ${progress.total} done`}
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
          <p className="font-serif text-lg italic text-cocoa-light">Welcome to LAHER Bespoke</p>
          <SpacedHeading className="mt-3">
            Thank you{first ? `, ${first}` : ''}
          </SpacedHeading>
          <p className="mt-4 text-[16px] leading-relaxed text-ink">Your ring is about to take shape. Here’s how:</p>
          <ol className="mt-5 space-y-4">
            {[
              ['Design', 'We create 3D renders of your piece, usually within 7 days.'],
              ['Review', 'We email you a private link to request changes or approve.'],
              ['Make', 'Our jewellers make your ring.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cocoa/30 font-serif text-lg text-cocoa">{i + 1}</span>
                <p className="pt-1 text-[15.5px] leading-relaxed"><span className="font-semibold text-cocoa-dark">{t}</span> – {d}</p>
              </li>
            ))}
          </ol>
          {progress.total > 0 && (
            <p className="mt-6 text-[15.5px] leading-relaxed text-ink">First, a few quick details.</p>
          )}
        </section>

        {/* 2. Ring size */}
        <Section id="size" title="Ring size" done={doneOf('size')} counted={progress.sections.some(s => s.key === 'size')}>
          <RingSizeSection code={job.publicCode} size={job.ringSize} unconfirmed={unconfirmed}
            notSure={!!job.ringSizeNotSureAt} messageLink={messageLink} />
        </Section>

        {/* 3. Setting and wedding band */}
        {showSetting && (
          <Section id="setting" title="Setting" done={doneOf('setting')} counted>
            <p className="mt-2 font-serif text-[1.35rem] leading-snug text-cocoa">{SETTING_QUESTION}</p>
            <SettingChooser code={job.publicCode} initial={job.settingChoice} locked={ob.settingLocked} images={ob.settingImages} />
          </Section>
        )}

        {/* 4. Irregular cluster */}
        {clusterOn && (
          <Section id="cluster" title="Cluster style" done={doneOf('cluster')} counted>
            <p className="mt-2 font-serif text-[1.35rem] leading-snug text-cocoa">Which cluster styles do you like?</p>
            <p className="mt-1 text-[15px] text-stone">Choose any.</p>
            <ClusterChooser code={job.publicCode} initial={job.clusterStyles ?? []} saved={!!job.clusterSavedAt}
              locked={locked && !!job.clusterSavedAt}
              images={ob.clusterImages} />
          </Section>
        )}

        {/* 5. Questions from the team */}
        {questions.length > 0 && (
          <Section id="questions" title="Questions from us" done={doneOf('questions')} counted>
            <StaffQuestions code={job.publicCode} locked={locked} questions={questions} />
          </Section>
        )}

        {/* 6. Anything else */}
        <Section id="notes" title="Anything else?">
          <p className="mt-2 text-[15px] leading-relaxed text-stone">Inspiration, must-haves, things to avoid.</p>
          <DesignerNotes code={job.publicCode} sent={notes} />
        </Section>

        {/* 7. Questions */}
        <section className="mt-14 rounded-2xl border border-sand bg-white/60 px-5 py-6 text-center sm:px-6">
          <p className="font-serif text-xl text-cocoa-dark">Questions?</p>
          <p className="mt-1 text-[15px] text-stone">
            <Link href={messageLink} className="text-cocoa underline underline-offset-4 hover:text-cocoa-dark">Message us</Link>
            {' '}and we’ll reply.
          </p>
          <p className="mt-4 text-xs text-stone">Come back any time.</p>
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
      <div className="flex items-start justify-between gap-3">
        <SpacedHeading as="h2" size="md">{title}</SpacedHeading>
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
