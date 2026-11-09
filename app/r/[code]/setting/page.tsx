import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { db, versions } from '@/lib/db'
import { getJobByCode } from '@/lib/jobs'
import { SETTING_QUESTION, settingState } from '@/lib/setting'
import { getSettingImages } from '@/lib/setting-server'
import { Wordmark } from '@/components/brand'
import SettingChooser from './client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your setting — LAHER', robots: { index: false, follow: false } }

export default async function SettingQuestionPage({ params }: { params: { code: string } }) {
  const row = await getJobByCode(params.code)
  if (!row) notFound()
  const { job, designerName } = row
  const [[{ n }], images] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(versions)
      .where(and(eq(versions.jobId, job.id), eq(versions.status, 'published'))),
    getSettingImages(),
  ])
  const state = settingState(job, n)
  const firstName = job.customerName.split(' ')[0]
  const designPage = `/r/${job.publicCode}`

  return (
    <div className="min-h-screen bg-ivory font-inter text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark />
          <Link href={designPage} className="text-[11px] uppercase tracking-[0.25em] text-stone hover:text-cocoa">Your design</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <p className="text-sm text-stone">Hi {firstName},</p>
        <h1 className="mt-1 font-serif text-[1.9rem] leading-tight text-cocoa-dark sm:text-[2.4rem]">{SETTING_QUESTION}</h1>

        {state === 'not_needed' ? (
          <p className="mt-10 rounded-2xl border border-sand bg-white/60 px-6 py-10 text-center text-[15px] leading-relaxed text-stone">
            There’s no need to choose: {designerName ?? 'your designer'} has this covered for your design.
          </p>
        ) : (
          <SettingChooser code={job.publicCode} initial={job.settingChoice} locked={state === 'locked'}
            images={{ high_set: images.high_set?.url ?? null, low_set: images.low_set?.url ?? null }} />
        )}

        <div className="mt-12 rounded-2xl border border-sand bg-white/60 px-5 py-5 text-center sm:px-6">
          <p className="font-serif text-xl text-cocoa-dark">Not sure which is right for you?</p>
          <p className="mt-1 text-[15px] text-stone">
            <Link href={`${designPage}#message-the-studio`} className="text-cocoa underline underline-offset-4 hover:text-cocoa-dark">Send us a message</Link>
            {' '}and we’ll talk it through.
          </p>
        </div>
      </main>
    </div>
  )
}
