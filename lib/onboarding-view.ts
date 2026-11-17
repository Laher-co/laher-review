import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db, events, jobs, onboardingNotes, onboardingQuestions, versions } from './db'
import { formatSydney } from './format'
import { settingState } from './setting'
import { getSettingImages } from './setting-server'
import { getClusterImages } from './onboarding-server'
import { irregularClusterOn, onboardingProgress, sizeUnconfirmed } from './onboarding'

type Job = typeof jobs.$inferSelect

/**
 * Everything the customer's onboarding needs, for the welcome page (before
 * Version One) and the "Your brief" panel on the design page (after).
 */
export async function loadOnboarding(job: Job) {
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
  const clusterOn = irregularClusterOn(job)
  const unconfirmed = sizeUnconfirmed(job.ringSizeStatus, job.ringSize)
  const progress = onboardingProgress({
    ringSizeStatus: unconfirmed ? 'unconfirmed' : 'confirmed', ringSizeNotSureAt: job.ringSizeNotSureAt,
    sizeConfirmedByCustomer: customerSized > 0,
    settingQuestion: job.settingQuestion, settingChoice: job.settingChoice, settingNotNeeded: job.settingNotNeeded,
    clusterOn, clusterSavedAt: job.clusterSavedAt, questions,
  })
  return {
    published,
    locked: published > 0,
    clusterOn,
    unconfirmed,
    progress,
    showSetting: job.settingQuestion && !job.settingNotNeeded,
    settingLocked: settingState(job, published) === 'locked',
    settingImages: { high_set: settingImages.high_set?.url ?? null, low_set: settingImages.low_set?.url ?? null },
    clusterImages: Object.fromEntries(Object.entries(clusterImages).map(([k, v]) => [k, v?.url ?? null])) as Record<string, string | null>,
    questions: questions.map(q => ({ id: q.id, question: q.question, answer: q.answer })),
    notes: notes.map(n => ({ id: n.id, body: n.body, photos: n.photos.map(p => p.url), when: formatSydney(n.createdAt) })),
  }
}

export type Onboarding = Awaited<ReturnType<typeof loadOnboarding>>
