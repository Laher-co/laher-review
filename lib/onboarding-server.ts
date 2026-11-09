import 'server-only'
import { eq, and, isNull } from 'drizzle-orm'
import { db, jobs, kv } from './db'
import { logEvent } from './events'
import { tracked } from './issues'
import { getCard, type TrelloCard } from './trello'
import { cardDetails, createJobFromDetails } from './job-create'
import { isEmailOnlyName } from './trello-parse'
import { hasLabel, LABEL_OLD_SYSTEM } from './stone'
import {
  irregularClusterOn, LABEL_SETTING_QUESTION, mentionsIrregularCluster, newQuestionComment, onboardingLinkComment,
  onboardingPath, type ClusterStyle,
} from './onboarding'

type Job = typeof jobs.$inferSelect

/** The customer's onboarding page on the live site (Trello keeps the link). */
export function onboardingUrl(publicCode: string) {
  const base = (process.env.APP_URL ?? 'https://review.laher.co').replace(/\/$/, '')
  return `${base}${onboardingPath(publicCode)}`
}

/** The job in LAHER Studio (where the welcome email is sent from). */
export function studioJobUrl(jobId: string) {
  const base = (process.env.APP_URL ?? 'https://review.laher.co').replace(/\/$/, '')
  return `${base}/studio/jobs/${jobId}`
}

/** A question was switched on or added: Studio offers "Let the customer know" if the welcome email already went. */
export async function markQuestionAdded(jobId: string) {
  await db.update(jobs).set({ onboardingQuestionAddedAt: new Date() }).where(eq(jobs.id, jobId))
}

/** Why a card can't have an onboarding page, or null if it can. */
export function onboardingSkipReason(card: TrelloCard) {
  if (hasLabel(card.labels, LABEL_OLD_SYSTEM)) return 'OLD SYSTEM card'
  if (!isEmailOnlyName(card.name)) return 'card name isn’t just an email'
  return null
}

/**
 * The job for this card, created if needed (in any list, even before a
 * designer is assigned). Questions switched on from the card as it is now.
 */
export async function ensureOnboardingJob(card: TrelloCard): Promise<Job> {
  const [existing] = await db.select().from(jobs).where(eq(jobs.trelloCardId, card.id))
  if (existing) return existing
  const d = await cardDetails(card)
  const id = await createJobFromDetails(d, {
    customerName: d.customerName || d.customerEmail, customerEmail: d.customerEmail,
    designerId: d.designerId, createdBy: null, via: 'onboarding_label',
  })
  const [job] = await db.update(jobs).set({
    settingQuestion: hasLabel(card.labels, LABEL_SETTING_QUESTION),
    irregularClusterAuto: mentionsIrregularCluster(card.desc),
  }).where(eq(jobs.id, id)).returning()
  return job
}

/** Posts "Onboarding link: …" on the card, once per card (safe if two events arrive together). */
export async function postOnboardingLink(job: Job) {
  const [claimed] = await db.update(jobs).set({ onboardingLinkPostedAt: new Date() })
    .where(and(eq(jobs.id, job.id), isNull(jobs.onboardingLinkPostedAt))).returning({ id: jobs.id })
  if (!claimed) return false
  const r = await tracked('trello_comment', job.id, 'Post the onboarding link on the Trello card',
    { type: 'trello.comment', args: { cardId: job.trelloCardId, text: onboardingLinkComment(onboardingUrl(job.publicCode), studioJobUrl(job.id)) } })
  await logEvent(job.id, null, 'onboarding_link_posted', { ok: r.ok })
  return true
}

/** A question was added after the link went out: tell the team to let the customer know. */
export async function notifyNewQuestion(job: Job, what: string) {
  if (!job.onboardingLinkPostedAt) return false
  await tracked('trello_comment', job.id, `Post “New question added” (${what}) on the Trello card`,
    { type: 'trello.comment', args: { cardId: job.trelloCardId, text: newQuestionComment(onboardingUrl(job.publicCode)) } })
  await logEvent(job.id, null, 'onboarding_question_added', { what })
  return true
}

/**
 * SETTING QUESTION on or off (Studio switch or the label). Switching it on
 * posts the onboarding link if it hasn't gone out yet, otherwise "New question added".
 */
export async function setSettingQuestion(job: Job, on: boolean, o: { staffId?: string | null; source: 'studio' | 'trello' }) {
  if (job.settingQuestion !== on) {
    await db.update(jobs).set({ settingQuestion: on, updatedAt: new Date() }).where(eq(jobs.id, job.id))
    if (o.source !== 'trello') {
      await tracked('trello_label', job.id, `${on ? 'Add' : 'Remove'} the “${LABEL_SETTING_QUESTION}” label`, {
        type: on ? 'trello.addLabel' : 'trello.removeLabel', args: { cardId: job.trelloCardId, name: LABEL_SETTING_QUESTION },
      })
    }
    await logEvent(job.id, o.staffId ?? null, `setting_question_${on ? 'on' : 'off'}`, { source: o.source })
    if (on) await markQuestionAdded(job.id)
    if (on && job.onboardingLinkPostedAt) return notifyNewQuestion(job, 'setting question')
  }
  if (on && !job.onboardingLinkPostedAt) return postOnboardingLink(job)
  return false
}

/** The label was added to or removed from a card in Trello. */
export async function handleOnboardingLabel(cardId: string, label: 'link' | 'setting', added: boolean) {
  const card = await getCard(cardId)
  if (!card) return 'card not found'
  const skip = onboardingSkipReason(card)
  if (skip) return `skipped: ${skip}`
  if (label === 'link') {
    if (!added) return 'removed (nothing to do)'
    const job = await ensureOnboardingJob(card)
    return (await postOnboardingLink(job)) ? 'link posted' : 'link already posted'
  }
  // SETTING QUESTION: read live, so the switch matches the card
  const on = hasLabel(card.labels, LABEL_SETTING_QUESTION)
  const [existing] = await db.select().from(jobs).where(eq(jobs.trelloCardId, cardId))
  if (!existing && !on) return 'no job'
  const job = existing ?? await ensureOnboardingJob(card)
  // A brand-new job already has the switch on from the card: still post the link
  const before = existing ? job : { ...job, settingQuestion: false }
  await setSettingQuestion(before, on, { source: 'trello' })
  return `setting question ${on ? 'on' : 'off'}`
}

/** Irregular cluster switched on or off (staff override, or the description changed). */
export async function updateIrregularCluster(job: Job, change: { auto?: boolean; override?: boolean | null }, staffId?: string | null) {
  const next = {
    irregularClusterAuto: change.auto ?? job.irregularClusterAuto,
    irregularClusterOverride: change.override !== undefined ? change.override : job.irregularClusterOverride,
  }
  if (next.irregularClusterAuto === job.irregularClusterAuto && next.irregularClusterOverride === job.irregularClusterOverride) return
  await db.update(jobs).set({ ...next, updatedAt: new Date() }).where(eq(jobs.id, job.id))
  const was = irregularClusterOn(job), now = irregularClusterOn(next)
  if (was !== now) await logEvent(job.id, staffId ?? null, `irregular_cluster_${now ? 'on' : 'off'}`, { source: change.auto !== undefined ? 'description' : 'studio' })
  if (!was && now) {
    await markQuestionAdded(job.id)
    await notifyNewQuestion(job, 'irregular cluster')
  }
}

// ── Cluster style images (Studio → Settings, Ryan only) ───────────────────────

const CLUSTER_IMAGES_KEY = 'cluster_images'
export type ClusterImages = Partial<Record<ClusterStyle, { url: string; pathname: string }>>

export async function getClusterImages(): Promise<ClusterImages> {
  const [row] = await db.select().from(kv).where(eq(kv.key, CLUSTER_IMAGES_KEY))
  return (row?.value as ClusterImages | undefined) ?? {}
}

export async function setClusterImage(style: ClusterStyle, image: { url: string; pathname: string } | null) {
  const current = await getClusterImages()
  const next: ClusterImages = { ...current }
  if (image) next[style] = image
  else delete next[style]
  await db.insert(kv).values({ key: CLUSTER_IMAGES_KEY, value: next })
    .onConflictDoUpdate({ target: kv.key, set: { value: next, updatedAt: new Date() } })
  return current[style] ?? null
}
